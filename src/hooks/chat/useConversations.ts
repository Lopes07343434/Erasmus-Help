import { useEffect, useMemo } from 'react'
import type { ConversationsState } from '@/services/chat/api'
import { sortConversations, useChatStore } from '@/services/chat/chatStore'
import { retryChatSession, startChat } from '@/services/chat/session'
import { refreshConversations } from '@/services/chat/threads'
import type { ConversationKind } from '@/services/chat/types'
import { sessionGate } from './sessionGate'

function refresh(): void {
  if (useChatStore.getState().session.status === 'ready') void refreshConversations()
  else retryChatSession()
}

/**
 * My conversations of one kind, most recent first. Archived conversations are INCLUDED (read-only,
 * `archivedAt !== null`) so managers can find and unarchive them — filter them out for the main list.
 * Live: new messages bump order/preview/unread, memberships and renames/archiving apply immediately.
 */
export function useConversations(kind: ConversationKind): ConversationsState {
  const session = useChatStore((s) => s.session)
  const list = useChatStore((s) => s.list)
  useEffect(() => startChat(), [])

  const ready = session.status === 'ready'
  useEffect(() => {
    if (ready && useChatStore.getState().list.status === 'idle') void refreshConversations()
  }, [ready])

  const items = useMemo(() => sortConversations(Object.values(list.byId).filter((c) => c.kind === kind)), [list.byId, kind])

  return useMemo<ConversationsState>(() => {
    const gate = sessionGate(session)
    if (gate) return { status: gate.status, items: [], error: gate.error, refresh }
    if (list.status === 'success') return { status: 'success', items, error: null, refresh }
    if (list.status === 'error') return { status: 'error', items, error: list.error, refresh }
    return { status: 'loading', items, error: null, refresh }
  }, [session, list.status, list.error, items])
}
