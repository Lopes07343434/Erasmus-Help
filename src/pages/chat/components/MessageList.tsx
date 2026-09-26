import { useEffect, useMemo, useRef } from 'react'
import { History } from 'lucide-react'
import { Button, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ChatMessage, ConversationKind, PublicProfile } from '@/services/chat/types'
import { formatDayLabel, groupByDay } from '../chatFormat'
import { useNow } from '../chatHooks'
import { MessageBubble } from './MessageBubble'

interface MessageListProps {
  messages: readonly ChatMessage[]
  /** Sender profiles by user id (incl. people who left). */
  senders: Readonly<Record<string, PublicProfile>>
  meId: string
  kind: ConversationKind
  hasOlder: boolean
  loadingOlder: boolean
  /** Auto-load older messages when the top is reached (false until the first scroll to the bottom). */
  autoLoadOlder: boolean
  onLoadOlder: () => void
  onRetry: (messageId: string) => void
  onDiscard: (messageId: string) => void
  getAudioUrl: (audioPath: string) => Promise<string>
}

/**
 * Chronological messages grouped by day ("Hoje", "Ontem", date); in groups each run of consecutive incoming messages
 * from one person starts with the author ("Samuel Lopes · 15"). The top holds "load older" (a button, also
 * auto-triggered by an IntersectionObserver when scrolled into view) or the start-of-conversation marker.
 * New incoming messages are announced by the page's live log, not by this list (older pages would be read too).
 */
export function MessageList({
  messages,
  senders,
  meId,
  kind,
  hasOlder,
  loadingOlder,
  autoLoadOlder,
  onLoadOlder,
  onRetry,
  onDiscard,
  getAudioUrl,
}: MessageListProps) {
  const i18n = useI18n()
  const { t } = i18n
  const now = useNow()
  const days = useMemo(() => groupByDay(messages), [messages])
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadRef = useRef(onLoadOlder)
  useEffect(() => {
    loadRef.current = onLoadOlder
  }, [onLoadOlder])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasOlder || loadingOlder || !autoLoadOlder || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current()
      },
      { rootMargin: '240px 0px 0px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasOlder, loadingOlder, autoLoadOlder])

  return (
    <section aria-label={t('chat.conversation.messages')} className="flex flex-1 flex-col justify-end gap-3 py-4">
      {hasOlder ? (
        <div ref={sentinelRef} className="flex min-h-11 justify-center">
          {loadingOlder ? (
            <Spinner size={20} label={t('chat.conversation.loadingOlder')} className="self-center text-primary" />
          ) : (
            <Button variant="ghost" size="sm" icon={History} onClick={onLoadOlder}>
              {t('chat.conversation.loadOlder')}
            </Button>
          )}
        </div>
      ) : messages.length > 0 ? (
        <p className="m-0 text-center text-xs font-medium text-text3">{t('chat.conversation.start')}</p>
      ) : null}

      {days.map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-2">
          <h2
            id={`day-${day.key}`}
            className="m-0 self-center rounded-full border border-solid border-border bg-surface px-3 py-1 text-xs leading-[1.4] font-semibold text-text2 backdrop-blur-[16px]"
          >
            {formatDayLabel(day.date, now, i18n)}
          </h2>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {day.items.map((message, index) => {
              const mine = message.senderId === meId
              // Groups: the author once per run of consecutive messages from the same person (screen readers still
              // hear the name on every bubble).
              const sameAuthorAsPrevious = index > 0 && day.items[index - 1]?.senderId === message.senderId
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={mine}
                  sender={mine ? null : (senders[message.senderId] ?? null)}
                  showSender={kind === 'group' && !sameAuthorAsPrevious}
                  onRetry={onRetry}
                  onDiscard={onDiscard}
                  getAudioUrl={getAudioUrl}
                />
              )
            })}
          </ol>
        </section>
      ))}
    </section>
  )
}
