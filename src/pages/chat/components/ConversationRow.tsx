import { memo } from 'react'
import { Link } from 'react-router'
import { Mic, Users } from 'lucide-react'
import { UnreadBadge } from '@/components/navigation/UnreadBadge'
import { cn } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ConversationSummary } from '@/services/chat/types'
import { conversationTitle, formatListTime, lastMessageParts, previewLine, publicIdLabel } from '../chatFormat'
import { conversationPath } from '../chatPaths'
import { ChatAvatar } from './ChatAvatar'
import { MiniPill } from './Pills'

interface ConversationRowProps {
  conversation: ConversationSummary
  meId: string | null
  now: Date
  /** Open next to the list (desktop split view): highlighted and `aria-current`. */
  active?: boolean
}

/**
 * One conversation in the Chat list (a link, min-height 72): avatar · name + "ID: 15" (direct) or 👥 N participants
 * (group; "N participantes" in its name and tooltip) · time · last message ("Tu: …", "Ana: …", 🎤 "Áudio 0:12") ·
 * unread badge. Unread rows are tinted; the conversation open in the split view is highlighted.
 */
export const ConversationRow = memo(function ConversationRow({ conversation, meId, now, active = false }: ConversationRowProps) {
  const i18n = useI18n()
  const { t, tn } = i18n
  const group = conversation.kind === 'group'
  const title = conversationTitle(conversation, i18n)
  const unread = conversation.unreadCount
  const hasUnread = unread > 0
  const time = formatListTime(conversation.lastMessageAt ?? conversation.lastMessage?.createdAt ?? null, now, i18n)
  const parts = lastMessageParts(conversation.lastMessage, conversation.kind, meId, i18n)
  const other = conversation.otherUser
  const archived = conversation.archivedAt !== null
  // Direct: the person's public ID (people find and add each other by it). Group: how many participants.
  const participants = tn('chat.participants', conversation.membersCount)
  const publicId = other ? publicIdLabel(other.publicId) : ''

  const label = [
    title,
    group ? participants : publicId || null,
    !group && other ? t(`chat.roles.${other.role}`) : null,
    archived ? t('chat.list.archivedPill') : null,
    hasUnread ? tn('chat.unread', unread) : null,
    parts ? t('chat.list.lastMessage', { text: previewLine(parts, i18n) }) : t('chat.preview.empty'),
    time || null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Link
      // Groups keep the list on "Grupos" (desktop split view).
      to={conversationPath(conversation.id, group ? 'grupos' : undefined)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left text-text no-underline transition-colors duration-150 focus-visible:-outline-offset-2 active:bg-primary-soft',
        active ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--primary)]' : hasUnread && 'bg-primary/6',
      )}
    >
      <ChatAvatar name={title} group={group} photo={group ? conversation.avatarPath : (other?.avatarPath ?? null)} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span aria-hidden="true" className="flex min-w-0 items-baseline gap-2">
          {/* The ID / participants count is short and always shows: the name truncates first. */}
          <span className={cn('min-w-0 truncate text-[15px] leading-[1.25]', hasUnread ? 'font-bold' : 'font-semibold')}>{title}</span>
          {group ? (
            <span title={participants} className="flex shrink-0 items-center gap-0.5 self-center text-xs font-medium text-text3 tabular-nums">
              <Users size={12} className="shrink-0" />
              {conversation.membersCount}
            </span>
          ) : publicId ? (
            <span className="shrink-0 font-mono text-xs font-medium text-text3 tabular-nums">{publicId}</span>
          ) : null}
          {archived ? <MiniPill className="self-center">{t('chat.list.archivedPill')}</MiniPill> : null}
          <span className={cn('ml-auto shrink-0 pl-1 text-xs tabular-nums', hasUnread ? 'font-bold text-primary' : 'font-medium text-text3')}>{time}</span>
        </span>
        <span aria-hidden="true" className="flex min-w-0 items-center gap-2">
          <span className={cn('flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-[1.35]', hasUnread ? 'font-semibold text-text' : 'font-medium text-text3')}>
            {parts ? (
              <>
                {parts.sender ? <span className="shrink-0">{`${parts.sender}:`}</span> : null}
                {parts.audio ? <Mic size={13} className="shrink-0 text-primary" /> : null}
                <span className="min-w-0 truncate">{parts.text}</span>
              </>
            ) : (
              <span className="min-w-0 truncate italic">{t('chat.preview.empty')}</span>
            )}
          </span>
          <UnreadBadge count={unread} />
        </span>
      </span>
    </Link>
  )
})
