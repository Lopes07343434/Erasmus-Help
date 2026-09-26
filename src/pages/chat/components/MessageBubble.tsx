import { memo, useMemo } from 'react'
import { Check, CheckCheck, CircleAlert, Clock, Mic, RotateCw, Trash2, type LucideIcon } from 'lucide-react'
import { AudioMessagePlayer } from '@/components/chat/audio'
import { Button, cn } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ChatMessage, MessageStatus, PublicProfile } from '@/services/chat/types'
import { audioLabel, formatMessageTime } from '../chatFormat'
import { messageElementId } from '../chatPaths'
import { publicIdNumber } from './groupMembers'
import { RolePill } from './Pills'

interface MessageBubbleProps {
  message: ChatMessage
  mine: boolean
  /** Sender profile (incoming messages). */
  sender: PublicProfile | null
  /** Groups: show the author ("Samuel Lopes · 15" + role pill) above incoming text (first of a run from the same person). */
  showSender: boolean
  onRetry: (messageId: string) => void
  onDiscard: (messageId: string) => void
  getAudioUrl: (audioPath: string) => Promise<string>
}

const STATUS_ICONS: Record<MessageStatus, LucideIcon> = { sending: Clock, sent: Check, read: CheckCheck, failed: CircleAlert }

/**
 * One message, styled like the design's talk bubbles (radius 16, 10/14 padding, 15/1.4/500): mine on the right in
 * primary with white text, others on the left on a blurred surface. Time in every bubble; delivery state on mine
 * (clock → check → double check; failed → "Não foi possível enviar a mensagem." + retry/discard). Memoized: callbacks
 * must be stable.
 */
export const MessageBubble = memo(function MessageBubble({ message, mine, sender, showSender, onRetry, onDiscard, getAudioUrl }: MessageBubbleProps) {
  const i18n = useI18n()
  const { t } = i18n
  const time = formatMessageTime(message.createdAt, i18n)
  const failed = mine && message.status === 'failed'
  const senderName = mine ? t('chat.conversation.you') : (sender?.displayName ?? t('chat.preview.someone'))
  const senderId = sender ? publicIdNumber(sender.publicId) : ''
  const author = senderId ? t('chat.conversation.senderWithId', { name: senderName, id: senderId }) : senderName
  const StatusIcon = STATUS_ICONS[message.status]
  const audioPath = message.kind === 'audio' ? message.audioPath : null
  const resolveAudio = useMemo(() => (audioPath ? () => getAudioUrl(audioPath) : null), [audioPath, getAudioUrl])
  // Optimistic/failed voice messages are not uploaded yet: show their duration without a player.
  const uploaded = message.status === 'sent' || message.status === 'read'

  return (
    <li id={messageElementId(message.id)} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'flex max-w-[84%] min-w-0 flex-col gap-1 rounded-tile border border-solid border-border px-3.5 py-2.5 lg:max-w-[72%]',
          // No per-bubble backdrop blur: one blur layer per message made long threads janky on low-end phones.
          mine ? 'bg-primary-strong text-white' : 'bg-surface-solid text-text',
        )}
      >
        {showSender && !mine ? (
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span dir="auto" className="min-w-0 text-[13px] leading-[1.3] font-bold break-words text-text2 [unicode-bidi:isolate]">{author}</span>
            {sender ? <RolePill role={sender.role} /> : null}
          </p>
        ) : (
          <span className="sr-only">{`${senderName}:`}</span>
        )}

        {message.kind === 'text' ? (
          <p dir="auto" className="m-0 text-[15px] leading-[1.4] font-medium break-words whitespace-pre-wrap [unicode-bidi:isolate]">{message.body}</p>
        ) : uploaded && resolveAudio ? (
          <AudioMessagePlayer id={message.id} src={resolveAudio} durationMs={message.audioDurationMs} tone={mine ? 'own' : 'other'} />
        ) : (
          <p className="m-0 flex items-center gap-2 text-[15px] leading-[1.4] font-medium">
            <Mic size={16} aria-hidden="true" className="shrink-0" />
            <span>{audioLabel(message.audioDurationMs, i18n)}</span>
          </p>
        )}

        <span className={cn('flex items-center justify-end gap-1 self-end text-[11px] leading-none font-medium tabular-nums', mine ? 'text-white/80' : 'text-text3')}>
          <time dateTime={message.createdAt}>{time}</time>
          {mine ? (
            <span role="img" aria-label={t(`chat.conversation.status.${message.status}`)} className="inline-flex">
              <StatusIcon size={13} aria-hidden="true" className={cn('shrink-0', message.status === 'read' && 'text-white')} />
            </span>
          ) : null}
        </span>
      </div>

      {failed ? (
        <div className="flex flex-col items-end text-danger">
          <p className="m-0 max-w-[84%] pt-0.5 pr-1 text-right text-xs leading-[1.4] font-semibold text-pretty lg:max-w-[72%]">
            <CircleAlert size={14} aria-hidden="true" className="mr-1 inline-block align-[-3px]" />
            {t('chat.conversation.sendFailed')}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-x-1">
            <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => onRetry(message.id)}>
              {t('chat.conversation.retry')}
            </Button>
            <Button variant="dangerGhost" size="sm" icon={Trash2} onClick={() => onDiscard(message.id)}>
              {t('chat.conversation.discard')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}, sameBubble)

/** Senders/messages are rebuilt upstream on every receipt; compare what the bubble actually renders. */
function sameBubble(a: MessageBubbleProps, b: MessageBubbleProps): boolean {
  const m = a.message
  const n = b.message
  return (
    a.mine === b.mine &&
    a.showSender === b.showSender &&
    a.onRetry === b.onRetry &&
    a.onDiscard === b.onDiscard &&
    a.getAudioUrl === b.getAudioUrl &&
    a.sender?.displayName === b.sender?.displayName &&
    a.sender?.role === b.sender?.role &&
    a.sender?.publicId === b.sender?.publicId &&
    m.id === n.id &&
    m.status === n.status &&
    m.createdAt === n.createdAt &&
    m.kind === n.kind &&
    (m.kind === 'text' ? n.kind === 'text' && m.body === n.body : n.kind === 'audio' && m.audioPath === n.audioPath && m.audioDurationMs === n.audioDurationMs)
  )
}
