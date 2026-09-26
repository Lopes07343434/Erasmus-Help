import { MessagesSquare } from 'lucide-react'
import { Outlet, useMatch } from 'react-router'
import { OfflineBanner, StateView } from '@/components/feedback'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useI18n } from '@/i18n/I18nProvider'
import ChatPage from './ChatPage'
import { CHAT_CONVERSATION_PATTERN } from './chatPaths'
import { CHAT_SPLIT_CONTEXT } from './chatSplit'

/**
 * /chat and /chat/:conversationId (layout route; the list is rendered here, the conversation is the child route).
 *  < 1024px  one screen at a time: the list or the conversation (immersive, no bottom nav).
 *  ≥ 1024px  split view: the list on the left (sticky, viewport-high, its own scroll; it stays mounted, so its tab,
 *            search and scroll survive opening conversations) and, on the right, the open conversation or a
 *            placeholder. The conversation keeps scrolling with the window (sticky header/composer, scroll-anchored
 *            timeline); the split cancels the content column's padding so both columns run edge to edge.
 */
export default function ChatLayout() {
  const desktop = useIsDesktop()
  const activeConversationId = useMatch(CHAT_CONVERSATION_PATTERN)?.params.conversationId ?? null

  if (!desktop) {
    return (
      <div key={activeConversationId ?? ''} className="animate-eh-fade">
        {activeConversationId !== null ? <Outlet /> : <ChatPage />}
      </div>
    )
  }

  return (
    <div className="-mx-10 mt-[calc(var(--eh-content-pt)*-1)] mb-[calc(var(--eh-content-pb)*-1)] grid grid-cols-[344px_minmax(0,1fr)] xl:grid-cols-[384px_minmax(0,1fr)] 2xl:border-x 2xl:border-solid 2xl:border-border">
      <div className="sticky top-0 flex h-dvh min-w-0 animate-eh-fade flex-col border-r border-solid border-border">
        {/* The layout's banner is hidden on desktop chat routes (an open conversation shows its own in its header):
            this one floats in the pane's top padding, above the header. */}
        {activeConversationId === null ? (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-(--z-floating)">
            <OfflineBanner />
          </div>
        ) : null}
        <ChatPage pane activeConversationId={activeConversationId} />
      </div>
      {/* Content padding reset: the conversation's own compensation (negative margins) becomes 0 here. */}
      <div key={activeConversationId ?? ''} className="flex min-w-0 animate-eh-fade flex-col px-10 [--eh-content-pb:0px] [--eh-content-pt:0px]">
        {activeConversationId !== null ? <Outlet context={CHAT_SPLIT_CONTEXT} /> : <SplitPlaceholder />}
      </div>
    </div>
  )
}

/** Right column while no conversation is open. */
function SplitPlaceholder() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col justify-center">
      <StateView icon={MessagesSquare} title={t('chat.split.selectTitle')} body={t('chat.split.selectBody')} />
    </div>
  )
}
