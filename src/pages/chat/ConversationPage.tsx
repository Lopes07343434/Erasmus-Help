import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, ArrowDown, CircleAlert, MessageCircleOff } from 'lucide-react'
import { spokenDuration } from '@/components/chat/audio'
import { ErrorState, StateView } from '@/components/feedback'
import { UnreadBadge } from '@/components/navigation/UnreadBadge'
import { Button, IconButton, Skeleton, useToast } from '@/components/ui'
import { useChatSession, useConversation } from '@/hooks/chat'
import { useStopAudioOnUnmount } from '@/hooks/useAudioPlayer'
import { useI18n } from '@/i18n/I18nProvider'
import type { RecordedAudio } from '@/services/audio'
import type { ChatMessage, MyProfile } from '@/services/chat/types'
import { chatErrorMessage } from './chatErrors'
import { useKeyboardInset, useLatest, useSheetSwitch } from './chatHooks'
import { chatTabPath } from './chatPaths'
import { ChatSessionState } from './components/ChatStates'
import { Composer } from './components/Composer'
import { ConversationHeader } from './components/ConversationHeader'
import { GroupSheets, type GroupSheet } from './components/GroupSheets'
import { MessageList } from './components/MessageList'
import { useConversationTimeline } from './useConversationTimeline'

/**
 * /chat/:conversationId — one conversation (direct or group). Full-height column that scrolls with the document:
 * sticky glass header, messages, sticky glass composer (keyboard- and safe-area-aware). The bottom nav and the
 * layout's offline banner are hidden on this route (AppLayout); the header shows the offline pill instead.
 */
export default function ConversationPage() {
  const { conversationId = '' } = useParams()
  const session = useChatSession()
  useStopAudioOnUnmount()
  const me = session.me

  if (me && (session.status === 'ready' || session.status === 'offline')) {
    return <ConversationView key={conversationId} conversationId={conversationId} me={me} />
  }
  return (
    <ConversationShell header={<ConversationHeader conversation={null} />}>
      <div className="flex flex-1 flex-col justify-center">
        <ChatSessionState session={session} variant="conversation" />
      </div>
    </ConversationShell>
  )
}

/** Cancels the content column's padding so the header/composer can stick edge to edge and the column fills the screen. */
function ConversationShell({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mt-[calc(var(--eh-content-pt)*-1)] mb-[calc(var(--eh-content-pb)*-1)] flex min-h-dvh flex-col">
      {header}
      {children}
      {footer}
    </div>
  )
}

function MessagesSkeleton() {
  const { t } = useI18n()
  const widths = ['58%', '42%', '66%', '36%', '52%']
  return (
    <div role="status" aria-busy="true" className="flex flex-1 flex-col justify-end gap-2.5 py-4">
      <span className="sr-only">{t('common.status.loading')}</span>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={i % 2 ? 40 : 56} radius={16} delay={i * 0.08} className={i % 2 ? 'self-end' : 'self-start'} />
      ))}
    </div>
  )
}

interface Announcement {
  id: string
  text: string
}

function ConversationView({ conversationId, me }: { conversationId: string; me: MyProfile }) {
  const i18n = useI18n()
  const { t, tn } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const state = useConversation(conversationId)
  const stateRef = useLatest(state)
  const { conversation, messages, senders, status } = state
  const ready = status === 'success' && conversation !== null
  const keyboardInset = useKeyboardInset()
  const sheets = useSheetSwitch<GroupSheet>()
  const timeline = useConversationTimeline(messages, me.id, ready)
  const timelineRef = useLatest(timeline)
  const sendersRef = useLatest(senders)

  const showError = useCallback((err: unknown) => toast.show(chatErrorMessage(err, i18n), { icon: CircleAlert, duration: 3200 }), [toast, i18n])

  // Stable callbacks for the memoized bubbles (the data hook's functions may change identity every render).
  const onRetry = useCallback((id: string) => void stateRef.current.retry(id).catch(showError), [stateRef, showError])
  const onDiscard = useCallback((id: string) => stateRef.current.discard(id), [stateRef])
  const getAudioUrl = useCallback((path: string) => stateRef.current.getAudioUrl(path), [stateRef])
  const sendText = useCallback((body: string) => stateRef.current.sendText(body), [stateRef])
  const sendAudio = useCallback((audio: RecordedAudio) => stateRef.current.sendAudio(audio), [stateRef])
  const loadOlder = useCallback(() => {
    const s = stateRef.current
    if (!s.hasOlder || s.loadingOlder) return
    timelineRef.current.keepPositionWhilePrepending()
    s.loadOlder().catch(showError)
  }, [stateRef, timelineRef, showError])

  // Read receipts: mark as read while this screen is visible and focused, and again for each new incoming message.
  const lastIncomingId = useMemo(() => messages.findLast((m) => m.senderId !== me.id)?.id ?? null, [messages, me.id])
  useEffect(() => {
    if (!ready) return
    const mark = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) stateRef.current.markRead()
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    window.addEventListener('focus', mark)
    return () => {
      document.removeEventListener('visibilitychange', mark)
      window.removeEventListener('focus', mark)
    }
  }, [ready, lastIncomingId, stateRef])

  // Screen readers hear new incoming messages (only those: not the history, not older pages, not my own).
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const { arrivals } = timeline
  useEffect(() => {
    if (arrivals.length === 0) return
    const describe = (m: ChatMessage) => {
      const name = sendersRef.current[m.senderId]?.displayName ?? t('chat.preview.someone')
      const text = m.kind === 'text' ? m.body : t('chat.conversation.audioMessage', { duration: spokenDuration(m.audioDurationMs, i18n) })
      return { id: m.id, text: t('chat.conversation.incoming', { name, text }) }
    }
    setAnnouncements((list) => [...list, ...arrivals.map(describe)].slice(-5))
  }, [arrivals, sendersRef, t, i18n])

  const header = <ConversationHeader conversation={conversation} onOpenInfo={conversation?.kind === 'group' ? () => sheets.open('info') : undefined} />

  if (status === 'not-found' || (status === 'success' && !conversation)) {
    return (
      <ConversationShell header={header}>
        <div className="flex flex-1 flex-col justify-center">
          <StateView
            icon={MessageCircleOff}
            title={t('chat.conversation.notFoundTitle')}
            body={t('chat.conversation.notFoundBody')}
            action={
              <Button variant="secondary" size="sm" onClick={() => void navigate(chatTabPath('conversas'), { replace: true })}>
                {t('chat.actions.backToList')}
              </Button>
            }
          />
        </div>
      </ConversationShell>
    )
  }

  if (status === 'error') {
    return (
      <ConversationShell header={header}>
        <div className="flex flex-1 flex-col justify-center">
          <ErrorState
            error={state.error ?? undefined}
            actions={
              <Button variant="secondary" size="sm" onClick={() => void navigate(chatTabPath('conversas'))}>
                {t('chat.actions.backToList')}
              </Button>
            }
          />
        </div>
      </ConversationShell>
    )
  }

  if (!ready || !conversation) {
    return (
      <ConversationShell header={header}>
        <MessagesSkeleton />
      </ConversationShell>
    )
  }

  const archived = conversation.archivedAt !== null
  const showJump = !timeline.atBottom && messages.length > 0

  return (
    <ConversationShell
      header={header}
      footer={
        <div
          className="sticky bottom-0 z-(--z-nav) -mx-5 border-t border-solid border-border bg-nav px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-[24px] backdrop-saturate-160 lg:-mx-10 lg:px-8 lg:pb-4"
          style={keyboardInset ? { bottom: keyboardInset } : undefined}
        >
          {showJump ? (
            <div className="absolute right-4 bottom-[calc(100%_+_12px)] lg:right-8">
              <IconButton
                variant="glass"
                icon={ArrowDown}
                aria-label={timeline.unseen > 0 ? `${t('chat.conversation.jumpToLatest')}, ${tn('chat.conversation.newMessages', timeline.unseen)}` : t('chat.conversation.jumpToLatest')}
                onClick={timeline.jumpToLatest}
                className="shadow-glass"
              >
                <UnreadBadge count={timeline.unseen} size="sm" ring className="absolute -top-1 -right-1" />
              </IconButton>
            </div>
          ) : null}
          {archived ? (
            <p role="status" className="m-0 flex min-h-11 items-center justify-center gap-2 px-2 text-center text-[13px] leading-[1.4] font-medium text-text2">
              <Archive size={16} aria-hidden="true" className="shrink-0 text-text3" />
              {t('chat.conversation.archivedNotice')}
            </p>
          ) : (
            <Composer onSendText={sendText} onSendAudio={sendAudio} />
          )}
        </div>
      }
    >
      <MessageList
        messages={messages}
        senders={senders}
        meId={me.id}
        kind={conversation.kind}
        hasOlder={state.hasOlder}
        loadingOlder={state.loadingOlder}
        autoLoadOlder={timeline.settled}
        onLoadOlder={loadOlder}
        onRetry={onRetry}
        onDiscard={onDiscard}
        getAudioUrl={getAudioUrl}
      />
      {messages.length === 0 ? <p className="m-0 pb-4 text-center text-sm text-text3">{t('chat.conversation.empty')}</p> : null}

      <div role="log" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((a) => (
          <p key={a.id}>{a.text}</p>
        ))}
      </div>

      {conversation.kind === 'group' ? (
        <GroupSheets sheet={sheets.sheet} openSheet={sheets.open} closeSheet={sheets.close} conversation={conversation} members={state.members} me={me} />
      ) : null}
    </ConversationShell>
  )
}
