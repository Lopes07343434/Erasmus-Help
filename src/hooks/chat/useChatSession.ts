import { useEffect, useMemo } from 'react'
import type { ChatSession } from '@/services/chat/api'
import { useChatStore } from '@/services/chat/chatStore'
import { retryChatSession, startChat } from '@/services/chat/session'

/**
 * Ensures an anonymous Supabase session + synced profile for the onboarded user. Mount-safe (idempotent):
 * the first chat hook mounted anywhere bootstraps the session once for the whole app.
 * `me.publicId` is the user's public "ID 07" (render with formatPublicId).
 */
export function useChatSession(): ChatSession {
  const session = useChatStore((s) => s.session)
  useEffect(() => startChat(), [])
  return useMemo<ChatSession>(
    () => ({
      status: session.status === 'idle' ? 'connecting' : session.status,
      me: session.status === 'ready' ? session.me : null,
      error: session.error,
      retry: retryChatSession,
    }),
    [session],
  )
}
