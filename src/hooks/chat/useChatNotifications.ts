import { useEffect, useRef } from 'react'
import type { IncomingMessageNotice } from '@/services/chat/api'
import { buildIncomingNotice, isNoticeSuppressed } from '@/services/chat/notifications'
import { onIncomingMessage } from '@/services/chat/realtime'
import { startChat } from '@/services/chat/session'

/**
 * Mounted once (AppLayout). Calls `onNotice` for incoming messages that are not mine and not in the
 * conversation currently open (`activeConversationId`, and also any conversation whose screen is
 * mounted). Title = group name, or the sender's name for direct chats. The sender profile is fetched
 * when it is not cached yet. Also bootstraps the chat session app-wide.
 */
export function useChatNotifications(onNotice: (notice: IncomingMessageNotice) => void, activeConversationId: string | null): void {
  const onNoticeRef = useRef(onNotice)
  const activeRef = useRef(activeConversationId)
  useEffect(() => {
    onNoticeRef.current = onNotice
    activeRef.current = activeConversationId
  })

  useEffect(() => {
    startChat()
    let alive = true
    const unsubscribe = onIncomingMessage((msg) => {
      void buildIncomingNotice(msg, activeRef.current).then(
        (notice) => {
          // The user may have opened that conversation while the sender profile was loading.
          if (alive && notice && !isNoticeSuppressed(msg, activeRef.current)) onNoticeRef.current(notice)
        },
        () => undefined,
      )
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])
}
