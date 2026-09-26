import { useEffect, useMemo } from 'react'
import type { RecordedAudio } from '@/services/audio'
import type { ConversationState } from '@/services/chat/api'
import { setActiveConversation, useChatStore, type MembersState, type ThreadState } from '@/services/chat/chatStore'
import { toMicros } from '@/services/chat/mappers'
import { discardMessage, retryMessage, sendAudio, sendText } from '@/services/chat/outbox'
import { startChat } from '@/services/chat/session'
import { getAudioUrl, loadConversation, loadOlderMessages, markConversationRead } from '@/services/chat/threads'
import type { ChatMessage, GroupMember, PublicProfile } from '@/services/chat/types'
import { sessionGate } from './sessionGate'

const EMPTY_MEMBERS: GroupMember[] = []

/**
 * Confirmed messages + optimistic ones (at the end). My confirmed messages become 'read' when every
 * OTHER member's lastReadAt ≥ createdAt (no other members → stays 'sent').
 */
export function deriveMessages(thread: ThreadState | undefined, members: MembersState | undefined, me: string | null): ChatMessage[] {
  if (!thread) return []
  let others = 0
  let minOtherRead = Number.POSITIVE_INFINITY
  for (const m of members?.items ?? EMPTY_MEMBERS) {
    if (m.id === me) continue
    others++
    minOtherRead = Math.min(minOtherRead, toMicros(m.lastReadAt))
  }
  const items =
    me && others > 0
      ? thread.items.map((msg) => (msg.senderId === me && msg.status === 'sent' && toMicros(msg.createdAt) <= minOtherRead ? { ...msg, status: 'read' as const } : msg))
      : thread.items
  return thread.pending.length ? [...items, ...thread.pending] : items
}

/**
 * One conversation: summary, members (read receipts), messages (chronological, optimistic included),
 * pagination and actions. Mounting it marks the conversation as ACTIVE (no unread bump, no notices);
 * each mount reloads the newest page + members in the background.
 *
 * - markRead(): call when the conversation is visible + focused, and on each new incoming message while
 *   visible. Throttled (~2 s) and skipped when nothing is unread.
 * - sendText/sendAudio: throw only on validation (invalid-input, archived, not-ready). Persistence failures
 *   turn the bubble 'failed' → retry(id) / discard(id).
 * - loadOlder(): rejects with AppError on failure (hasOlder stays true, so it can be retried).
 */
export function useConversation(conversationId: string): ConversationState {
  const session = useChatStore((s) => s.session)
  const thread = useChatStore((s) => s.threads[conversationId])
  const summary = useChatStore((s) => s.list.byId[conversationId])
  const members = useChatStore((s) => s.members[conversationId])
  const profiles = useChatStore((s) => s.profiles)
  const ready = session.status === 'ready'
  const me = session.userId

  useEffect(() => startChat(), [])

  useEffect(() => {
    setActiveConversation(conversationId)
    return () => {
      if (useChatStore.getState().activeConversationId === conversationId) setActiveConversation(null)
    }
  }, [conversationId])

  useEffect(() => {
    if (ready) void loadConversation(conversationId)
  }, [ready, conversationId])

  useEffect(() => {
    const onOnline = () => {
      if (useChatStore.getState().threads[conversationId]?.status === 'error') void loadConversation(conversationId)
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [conversationId])

  const messages = useMemo(() => deriveMessages(thread, members, me), [thread, members, me])

  const senders = useMemo(() => {
    const out: Record<string, PublicProfile> = {}
    const add = (p: PublicProfile) => {
      out[p.id] = { id: p.id, publicId: p.publicId, displayName: p.displayName, role: p.role }
    }
    for (const m of members?.items ?? EMPTY_MEMBERS) add(m)
    for (const msg of messages) {
      if (out[msg.senderId]) continue
      const p = profiles[msg.senderId]
      if (p) add(p)
    }
    return out
  }, [members, messages, profiles])

  const actions = useMemo(
    () => ({
      loadOlder: () => loadOlderMessages(conversationId),
      sendText: (body: string) => sendText(conversationId, body),
      sendAudio: (audio: RecordedAudio) => sendAudio(conversationId, audio),
      retry: (messageId: string) => retryMessage(conversationId, messageId),
      discard: (messageId: string) => discardMessage(conversationId, messageId),
      markRead: () => markConversationRead(conversationId),
      getAudioUrl: (audioPath: string) => getAudioUrl(conversationId, audioPath),
    }),
    [conversationId],
  )

  return useMemo<ConversationState>(() => {
    const gate = sessionGate(session)
    const base = {
      conversation: summary ?? null,
      members: members?.items ?? EMPTY_MEMBERS,
      messages,
      senders,
      hasOlder: thread?.hasOlder ?? false,
      loadingOlder: thread?.loadingOlder ?? false,
      ...actions,
    }
    if (gate) return { ...base, status: gate.status, error: gate.error }
    const status = thread?.status ?? 'idle'
    if (status === 'success' || status === 'not-found') return { ...base, status, error: status === 'not-found' ? thread?.error ?? null : null }
    if (status === 'error') return { ...base, status: 'error', error: thread?.error ?? null }
    return { ...base, status: 'loading', error: null }
  }, [session, summary, members, messages, senders, thread, actions])
}
