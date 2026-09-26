import { useMemo } from 'react'
import type { UnreadCounts } from '@/services/chat/api'
import { useChatStore } from '@/services/chat/chatStore'

/**
 * Unread totals for badges (nav, tabs). Archived conversations are not counted (they are hidden from
 * the main lists). Each conversation is capped at 100 by the server → render "99+" above 99.
 * Store-only on purpose (no session import): the nav renders it on first paint, and importing the session would pull
 * supabase-js into the entry chunk. The session is started by the chat hooks / the lazy notifications bridge.
 */
export function useUnreadCounts(): UnreadCounts {
  const byId = useChatStore((s) => s.list.byId)
  return useMemo(() => {
    let direct = 0
    let groups = 0
    for (const c of Object.values(byId)) {
      if (c.archivedAt) continue
      if (c.kind === 'direct') direct += c.unreadCount
      else groups += c.unreadCount
    }
    return { total: direct + groups, direct, groups }
  }, [byId])
}
