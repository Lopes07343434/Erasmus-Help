/**
 * Chat store (zustand, in memory only — NOT persisted: messages never touch localStorage).
 *
 * Holds the session, conversation summaries, per-conversation message pages (+ optimistic
 * messages), member/read state, a cache of public profiles and the active conversation.
 * The reducers below are pure state transitions (no network); orchestration lives in
 * session.ts / threads.ts / outbox.ts / realtime.ts.
 */
import { create } from 'zustand'
import type { AppError } from '@/services/errors'
import type { ChatSessionStatus, LoadStatus } from './api'
import { compareMessages, compareTimestamps, lastMessageFromMessage, type ConversationRowUpdate, type MembershipRow } from './mappers'
import { CHAT_LIMITS, type ChatMessage, type ConversationSummary, type GroupMember, type MyProfile, type PublicProfile } from './types'

/** 'idle' = not started yet (not onboarded / signed out). Hooks expose it as 'connecting'. */
export type SessionPhase = ChatSessionStatus | 'idle'

export interface SessionState {
  status: SessionPhase
  userId: string | null
  me: MyProfile | null
  error: AppError | null
}

export interface ConversationListState {
  status: LoadStatus | 'idle'
  error: AppError | null
  byId: Record<string, ConversationSummary>
}

export interface ThreadState {
  status: LoadStatus | 'not-found' | 'idle'
  error: AppError | null
  /** Messages stored server-side (status 'sent'), chronological. */
  items: ChatMessage[]
  /** Optimistic messages ('sending' | 'failed'), in the order they were written. */
  pending: ChatMessage[]
  hasOlder: boolean
  loadingOlder: boolean
}

export interface MembersState {
  status: LoadStatus
  items: GroupMember[]
}

export interface ChatState {
  session: SessionState
  list: ConversationListState
  threads: Record<string, ThreadState>
  members: Record<string, MembersState>
  /** Public profiles by user id (members, senders, lookups). */
  profiles: Record<string, PublicProfile>
  activeConversationId: string | null
}

const initialState = (): ChatState => ({
  session: { status: 'idle', userId: null, me: null, error: null },
  list: { status: 'idle', error: null, byId: {} },
  threads: {},
  members: {},
  profiles: {},
  activeConversationId: null,
})

export const useChatStore = create<ChatState>()(() => initialState())

const set = useChatStore.setState
const get = useChatStore.getState

export function resetChatStore(): void {
  set(initialState(), true)
}

const emptyThread = (): ThreadState => ({ status: 'idle', error: null, items: [], pending: [], hasOlder: false, loadingOlder: false })

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export function setSession(patch: Partial<SessionState>): void {
  set((s) => ({ session: { ...s.session, ...patch } }))
  const me = patch.me
  if (me) rememberProfiles([me])
}

// ---------------------------------------------------------------------------
// Profiles cache
// ---------------------------------------------------------------------------

export function rememberProfiles(profiles: readonly PublicProfile[]): void {
  if (profiles.length === 0) return
  set((s) => {
    let changed = false
    const next = { ...s.profiles }
    for (const p of profiles) {
      const cur = next[p.id]
      if (!cur || cur.displayName !== p.displayName || cur.role !== p.role || cur.publicId !== p.publicId) {
        next[p.id] = { id: p.id, publicId: p.publicId, displayName: p.displayName, role: p.role }
        changed = true
      }
    }
    return changed ? { profiles: next } : s
  })
}

// ---------------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------------

export function setListStatus(status: ConversationListState['status'], error: AppError | null = null): void {
  set((s) => ({ list: { ...s.list, status, error } }))
}

/** Replaces the list with the server truth (list_my_conversations). */
export function setConversations(items: readonly ConversationSummary[]): void {
  const byId: Record<string, ConversationSummary> = {}
  const profiles: PublicProfile[] = []
  for (const c of items) {
    byId[c.id] = c
    if (c.otherUser) profiles.push(c.otherUser)
  }
  set((s) => ({ list: { status: 'success', error: null, byId }, threads: markMissingThreads(s.threads, byId) }))
  rememberProfiles(profiles)
}

/** Threads of conversations that disappeared from my list (left / removed / deleted) → not-found. */
function markMissingThreads(threads: Record<string, ThreadState>, byId: Record<string, ConversationSummary>): Record<string, ThreadState> {
  let next: Record<string, ThreadState> | null = null
  for (const [id, t] of Object.entries(threads)) {
    if (!byId[id] && t.status === 'success') {
      next ??= { ...threads }
      next[id] = { ...t, status: 'not-found' }
    }
  }
  return next ?? threads
}

export function upsertConversation(summary: ConversationSummary): void {
  set((s) => ({ list: { ...s.list, byId: { ...s.list.byId, [summary.id]: summary } } }))
  if (summary.otherUser) rememberProfiles([summary.otherUser])
}

export function patchConversation(id: string, patch: Partial<ConversationSummary>): void {
  set((s) => {
    const cur = s.list.byId[id]
    if (!cur) return s
    return { list: { ...s.list, byId: { ...s.list.byId, [id]: { ...cur, ...patch } } } }
  })
}

/** I left / was removed / the group was deleted. */
export function removeConversation(id: string): void {
  set((s) => {
    const byId = { ...s.list.byId }
    delete byId[id]
    const members = { ...s.members }
    delete members[id]
    const thread = s.threads[id]
    const threads = thread ? { ...s.threads, [id]: { ...thread, status: 'not-found' as const } } : s.threads
    return { list: { ...s.list, byId }, members, threads }
  })
}

export function applyConversationUpdate(row: ConversationRowUpdate): boolean {
  const cur = get().list.byId[row.id]
  if (!cur) return false
  const lastMessageAt = !row.lastMessageAt ? cur.lastMessageAt : !cur.lastMessageAt || compareTimestamps(row.lastMessageAt, cur.lastMessageAt) > 0 ? row.lastMessageAt : cur.lastMessageAt
  patchConversation(row.id, {
    name: cur.kind === 'group' ? (row.name ?? cur.name) : null,
    allowLeave: row.allowLeave ?? cur.allowLeave,
    archivedAt: row.archivedAt,
    lastMessageAt,
  })
  return true
}

/** Sorted by lastMessageAt desc (fallback createdAt), then id — like list_my_conversations. */
export function sortConversations(items: readonly ConversationSummary[]): ConversationSummary[] {
  return [...items].sort((a, b) => {
    const d = compareTimestamps(b.lastMessageAt ?? b.createdAt, a.lastMessageAt ?? a.createdAt)
    if (d !== 0) return d
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function mergeSorted(items: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of items) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort(compareMessages)
}

export function updateThread(conversationId: string, update: (t: ThreadState) => ThreadState): void {
  set((s) => ({ threads: { ...s.threads, [conversationId]: update(s.threads[conversationId] ?? emptyThread()) } }))
}

/** First page loaded (replaces confirmed items, keeps optimistic ones). */
export function setThreadPage(conversationId: string, messages: readonly ChatMessage[], hasOlder: boolean): void {
  updateThread(conversationId, (t) => {
    const confirmedIds = new Set(messages.map((m) => m.id))
    // keep newer confirmed messages that arrived by Realtime while the page was loading
    const newest = messages[messages.length - 1]
    const extra = newest ? t.items.filter((m) => compareMessages(m, newest) > 0) : t.items
    return {
      ...t,
      status: 'success',
      error: null,
      items: mergeSorted(messages, extra),
      pending: t.pending.filter((m) => !confirmedIds.has(m.id)),
      hasOlder,
    }
  })
}

export function prependOlder(conversationId: string, messages: readonly ChatMessage[], hasOlder: boolean): void {
  updateThread(conversationId, (t) => ({ ...t, items: mergeSorted(t.items, messages), hasOlder, loadingOlder: false }))
}

/** Confirmed messages (Realtime insert, gap fill, own insert result). Deduped by id; replaces the optimistic copy. */
export function addConfirmedMessages(conversationId: string, messages: readonly ChatMessage[]): void {
  if (messages.length === 0) return
  const ids = new Set(messages.map((m) => m.id))
  set((s) => {
    const t = s.threads[conversationId]
    if (!t) return s
    return { threads: { ...s.threads, [conversationId]: { ...t, items: mergeSorted(t.items, messages), pending: t.pending.filter((m) => !ids.has(m.id)) } } }
  })
}

export function addPending(msg: ChatMessage): void {
  updateThread(msg.conversationId, (t) => ({ ...t, pending: [...t.pending.filter((m) => m.id !== msg.id), msg] }))
}

export function setPendingStatus(conversationId: string, id: string, status: 'sending' | 'failed'): void {
  updateThread(conversationId, (t) => ({ ...t, pending: t.pending.map((m) => (m.id === id ? { ...m, status } : m)) }))
}

export function removePending(conversationId: string, id: string): void {
  updateThread(conversationId, (t) => ({ ...t, pending: t.pending.filter((m) => m.id !== id) }))
}

export function findPending(conversationId: string, id: string): ChatMessage | undefined {
  return get().threads[conversationId]?.pending.find((m) => m.id === id)
}

/**
 * Applies a new message to the conversation summary: order (lastMessageAt), preview and unread.
 * Unread +1 only when the message is newer than the known last message, not mine, and the
 * conversation is not the active one. Returns false when the conversation is unknown.
 */
export function applyMessageToSummary(msg: ChatMessage, myUserId: string | null): boolean {
  const s = get()
  const cur = s.list.byId[msg.conversationId]
  if (!cur) return false
  const last = cur.lastMessage
  const isNewer = !last || compareMessages(msg, { id: last.id, createdAt: last.createdAt }) > 0
  if (!isNewer) return true
  const mine = msg.senderId === myUserId
  const active = s.activeConversationId === msg.conversationId
  const senderName = s.profiles[msg.senderId]?.displayName ?? (cur.otherUser?.id === msg.senderId ? cur.otherUser.displayName : null)
  const lastMessageAt = cur.lastMessageAt && compareTimestamps(cur.lastMessageAt, msg.createdAt) > 0 ? cur.lastMessageAt : msg.createdAt
  patchConversation(msg.conversationId, {
    lastMessage: lastMessageFromMessage(msg, senderName),
    lastMessageAt,
    unreadCount: mine || active ? cur.unreadCount : Math.min(cur.unreadCount + 1, CHAT_LIMITS.unreadCap),
  })
  return true
}

// ---------------------------------------------------------------------------
// Members / read state
// ---------------------------------------------------------------------------

export function setMembers(conversationId: string, items: readonly GroupMember[]): void {
  set((s) => ({ members: { ...s.members, [conversationId]: { status: 'success', items: [...items] } } }))
  rememberProfiles(items)
  patchConversation(conversationId, { membersCount: items.length })
}

/** Realtime UPDATE of conversation_members (read receipts / role changes). */
export function applyMembershipUpdate(row: MembershipRow): void {
  set((s) => {
    const m = s.members[row.conversationId]
    if (!m) return s
    let changed = false
    const items = m.items.map((it) => {
      if (it.id !== row.userId) return it
      const lastReadAt = row.lastReadAt && compareTimestamps(row.lastReadAt, it.lastReadAt) > 0 ? row.lastReadAt : it.lastReadAt
      const memberRole = row.memberRole ?? it.memberRole
      if (lastReadAt === it.lastReadAt && memberRole === it.memberRole) return it
      changed = true
      return { ...it, lastReadAt, memberRole }
    })
    return changed ? { members: { ...s.members, [row.conversationId]: { ...m, items } } } : s
  })
}

export function removeMember(conversationId: string, userId: string): void {
  set((s) => {
    const m = s.members[conversationId]
    if (!m || !m.items.some((it) => it.id === userId)) return s
    const items = m.items.filter((it) => it.id !== userId)
    const cur = s.list.byId[conversationId]
    return {
      members: { ...s.members, [conversationId]: { ...m, items } },
      list: cur ? { ...s.list, byId: { ...s.list.byId, [conversationId]: { ...cur, membersCount: items.length } } } : s.list,
    }
  })
}

/** My last_read_at moved forward (mark read here or on another device). */
export function applyMyReadState(conversationId: string, myUserId: string, lastReadAt: string): void {
  applyMembershipUpdate({ conversationId, userId: myUserId, lastReadAt, memberRole: null, joinedAt: null })
  const cur = get().list.byId[conversationId]
  if (!cur || cur.unreadCount === 0) return
  const newest = cur.lastMessage?.createdAt ?? cur.lastMessageAt
  if (!newest || compareTimestamps(lastReadAt, newest) >= 0) patchConversation(conversationId, { unreadCount: 0 })
}

// ---------------------------------------------------------------------------
// Active conversation
// ---------------------------------------------------------------------------

export function setActiveConversation(id: string | null): void {
  if (get().activeConversationId !== id) set({ activeConversationId: id })
}
