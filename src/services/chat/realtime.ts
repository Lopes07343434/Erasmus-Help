/**
 * ONE Realtime channel per signed-in user (Postgres Changes, filtered server-side by RLS):
 *   messages             INSERT            → thread append (dedupe by id), list order/preview/unread, notices
 *   conversation_members INSERT/UPDATE/DELETE → membership + read receipts (last_read_at)
 *   conversations        UPDATE            → name / archived / last_message_at
 *
 * Reconnects: realtime-js rejoins after CHANNEL_ERROR / TIMED_OUT with its own backoff (client.ts).
 * An unexpected CLOSED (e.g. server closed the channel) is reopened here with a gentle backoff, only
 * while online. Every (re)SUBSCRIBED triggers a resync (list + the open conversation) because events
 * sent while disconnected are lost.
 *
 * DELETE events of conversation_members are not RLS-filtered (primary key only): ignored unless the
 * conversation is one of mine.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '@/services/supabase/client'
import {
  addConfirmedMessages,
  applyConversationUpdate,
  applyMembershipUpdate,
  applyMessageToSummary,
  applyMyReadState,
  patchConversation,
  removeConversation,
  removeMember,
  useChatStore,
} from './chatStore'
import { parseConversationUpdate, parseMembershipRow, parseMessageRow } from './mappers'
import { getGeneration, isOffline, myUserId } from './runtime'
import { ensureProfiles, loadConversation, refreshConversations, refreshMyProfile, scheduleConversationsRefresh, scheduleMembersRefresh } from './threads'
import type { ChatMessage } from './types'

type Row = Record<string, unknown>
type IncomingListener = (msg: ChatMessage) => void

const get = useChatStore.getState

const incomingListeners = new Set<IncomingListener>()

/** New messages from Realtime (all of mine included — listeners filter). Returns an unsubscribe function. */
export function onIncomingMessage(listener: IncomingListener): () => void {
  incomingListeners.add(listener)
  return () => {
    incomingListeners.delete(listener)
  }
}

let channel: RealtimeChannel | null = null
let channelUserId: string | null = null
let reopenTimer: ReturnType<typeof setTimeout> | null = null
let reopenAttempt = 0
let subscribed = false
const REOPEN_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000] as const

// ---------------------------------------------------------------------------
// Event handlers (exported for tests)
// ---------------------------------------------------------------------------

export function handleMessageInsert(row: unknown): void {
  const msg = parseMessageRow(row)
  if (!msg) return
  const me = myUserId()
  const s = get()
  if (s.threads[msg.conversationId]) addConfirmedMessages(msg.conversationId, [msg])
  const known = applyMessageToSummary(msg, me)
  const isAdmin = s.session.me?.role === 'admin'
  // Unknown conversation → I was just added somewhere (admins receive every message: skip them).
  if (!known && !isAdmin) scheduleConversationsRefresh()
  if (msg.senderId !== me) void ensureProfiles([msg.senderId])
  if (known || !isAdmin) for (const l of [...incomingListeners]) l(msg)
}

export function handleMembershipChange(eventType: string, newRow: unknown, oldRow: unknown): void {
  const me = myUserId()
  const s = get()
  if (eventType === 'DELETE') {
    const row = parseMembershipRow(oldRow)
    if (!row || !s.list.byId[row.conversationId]) return
    if (row.userId === me) removeConversation(row.conversationId)
    else if (s.members[row.conversationId]) removeMember(row.conversationId, row.userId)
    else {
      const cur = s.list.byId[row.conversationId]
      if (cur) patchConversation(row.conversationId, { membersCount: Math.max(0, cur.membersCount - 1) })
    }
    return
  }
  const row = parseMembershipRow(newRow)
  if (!row) return
  if (eventType === 'INSERT') {
    if (row.userId === me) {
      scheduleConversationsRefresh()
      return
    }
    const cur = s.list.byId[row.conversationId]
    if (!cur) return
    if (s.members[row.conversationId]) scheduleMembersRefresh(row.conversationId)
    else patchConversation(row.conversationId, { membersCount: cur.membersCount + 1 })
    return
  }
  if (eventType === 'UPDATE') {
    const cur = s.list.byId[row.conversationId]
    if (!cur) return
    applyMembershipUpdate(row)
    if (row.userId !== me) return
    if (row.memberRole && row.memberRole !== cur.myRole) patchConversation(row.conversationId, { myRole: row.memberRole })
    if (row.lastReadAt && me) {
      applyMyReadState(row.conversationId, me, row.lastReadAt)
      // Read up to somewhere in the middle (another device): the exact count comes from the server.
      if ((get().list.byId[row.conversationId]?.unreadCount ?? 0) > 0) scheduleConversationsRefresh()
    }
  }
}

export function handleConversationUpdate(row: unknown): void {
  const parsed = parseConversationUpdate(row)
  if (parsed) applyConversationUpdate(parsed)
}

// ---------------------------------------------------------------------------
// Channel lifecycle
// ---------------------------------------------------------------------------

/** Events may have been missed: reload the list, my profile and the open conversation. */
function resync(): void {
  void refreshConversations()
  void refreshMyProfile()
  const active = get().activeConversationId
  if (active && get().threads[active]?.status === 'success') void loadConversation(active)
}

function clearReopen(): void {
  if (reopenTimer) clearTimeout(reopenTimer)
  reopenTimer = null
}

function scheduleReopen(): void {
  if (reopenTimer || !channelUserId || isOffline()) return
  const delay = REOPEN_BACKOFF_MS[Math.min(reopenAttempt, REOPEN_BACKOFF_MS.length - 1)] ?? 30_000
  reopenAttempt++
  reopenTimer = setTimeout(() => {
    reopenTimer = null
    openChannel()
  }, delay)
}

function closeChannel(): void {
  const ch = channel
  channel = null
  subscribed = false
  if (!ch) return
  const sb = getSupabase()
  if (sb) void sb.removeChannel(ch).catch(() => undefined)
}

function openChannel(): void {
  closeChannel()
  const sb = getSupabase()
  const userId = channelUserId
  if (!sb || !userId) return
  const gen = getGeneration()
  const ch = sb
    .channel(`chat:${userId}`)
    .on<Row>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      if (gen === getGeneration()) handleMessageInsert(payload.new)
    })
    .on<Row>('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, (payload) => {
      if (gen === getGeneration()) handleMembershipChange(payload.eventType, payload.new, payload.old)
    })
    .on<Row>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
      if (gen === getGeneration()) handleConversationUpdate(payload.new)
    })
  channel = ch
  ch.subscribe((status) => {
    if (channel !== ch || gen !== getGeneration()) return
    if (status === 'SUBSCRIBED') {
      subscribed = true
      reopenAttempt = 0
      resync()
    } else if (status === 'CLOSED') {
      // Not requested by us (we drop the reference before removing): reopen later.
      subscribed = false
      channel = null
      scheduleReopen()
    } else {
      // CHANNEL_ERROR / TIMED_OUT: realtime-js rejoins by itself (backoff).
      subscribed = false
    }
  })
}

function onOnline(): void {
  if (!channelUserId) return
  if (!channel) {
    clearReopen()
    openChannel()
  }
}

let hiddenAt: number | null = null
const RESYNC_AFTER_HIDDEN_MS = 30_000

function onVisibility(): void {
  if (document.visibilityState !== 'visible') {
    hiddenAt = Date.now()
    return
  }
  // Mobile browsers freeze sockets in the background: when the app comes back, make sure we are live.
  const wasHiddenLong = hiddenAt !== null && Date.now() - hiddenAt >= RESYNC_AFTER_HIDDEN_MS
  hiddenAt = null
  if (!channelUserId) return
  if (!channel && !isOffline()) {
    clearReopen()
    openChannel()
  } else if (subscribed && wasHiddenLong) {
    resync()
  }
}

export function startRealtime(userId: string): void {
  stopRealtime()
  channelUserId = userId
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  openChannel()
}

export function stopRealtime(): void {
  channelUserId = null
  clearReopen()
  reopenAttempt = 0
  window.removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVisibility)
  closeChannel()
}
