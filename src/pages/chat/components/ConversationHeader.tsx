import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Info } from 'lucide-react'
import { OfflineBanner } from '@/components/feedback'
import { IconButton } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ConversationSummary } from '@/services/chat/types'
import { conversationTitle, publicIdLabel } from '../chatFormat'
import { chatTabPath } from '../chatPaths'
import { ChatAvatar } from './ChatAvatar'
import { MiniPill, RolePill } from './Pills'

interface ConversationHeaderProps {
  conversation: ConversationSummary | null
  /** Groups: opens the group info sheet (title area + info button). */
  onOpenInfo?: () => void
}

/** Back target: the tab the conversation belongs to. */
const backPath = (conversation: ConversationSummary | null) => chatTabPath(conversation?.kind === 'group' ? 'grupos' : 'conversas')

/**
 * Sticky glass bar at the top of a conversation (edge to edge, below the status bar): back · avatar · name with
 * role pill + "ID 07" (direct) or "N participantes" (group, tappable → group info). Hosts the offline pill,
 * since the layout's banner is hidden on this screen.
 */
export function ConversationHeader({ conversation, onOpenInfo }: ConversationHeaderProps) {
  const i18n = useI18n()
  const { t, tn } = i18n
  const navigate = useNavigate()
  const group = conversation?.kind === 'group'
  const title = conversation ? conversationTitle(conversation, i18n) : ''
  const other = conversation?.otherUser ?? null
  const archived = conversation?.archivedAt != null

  let identity: ReactNode = null
  if (conversation && group) {
    identity = (
      <button
        type="button"
        onClick={onOpenInfo}
        aria-haspopup="dialog"
        aria-label={`${t('chat.actions.groupInfo')}: ${title}, ${tn('chat.participants', conversation.membersCount)}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control border-0 bg-transparent px-1 py-1 text-left text-text transition-colors duration-150 hover:bg-primary-soft focus-visible:-outline-offset-2"
      >
        <ChatAvatar group photo={conversation.avatarPath} size={40} />
        <span aria-hidden="true" className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base leading-[1.25] font-bold">{title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-text3">
            <span className="truncate">{tn('chat.participants', conversation.membersCount)}</span>
            {archived ? <MiniPill>{t('chat.list.archivedPill')}</MiniPill> : null}
          </span>
        </span>
      </button>
    )
  } else if (conversation) {
    identity = (
      <div className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1">
        <ChatAvatar name={title} photo={other?.avatarPath ?? null} size={40} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="m-0 truncate text-base leading-[1.25] font-bold">{title}</p>
          {other ? (
            <p className="m-0 flex min-w-0 items-center gap-1.5 text-[13px] text-text3">
              <RolePill role={other.role} />
              <span className="font-mono text-xs font-medium">{publicIdLabel(other.publicId)}</span>
              {archived ? <MiniPill>{t('chat.list.archivedPill')}</MiniPill> : null}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <header className="sticky top-0 z-(--z-nav) -mx-5 border-b border-solid border-border bg-nav px-2 pt-[calc(env(safe-area-inset-top)_+_6px)] pb-1.5 backdrop-blur-[24px] backdrop-saturate-160 lg:-mx-10 lg:px-6 lg:pt-3">
      <h1 className="sr-only">{title || t('chat.title')}</h1>
      <div className="flex min-h-12 items-center gap-1">
        <IconButton variant="plain" icon={ArrowLeft} aria-label={t('chat.actions.backToList')} onClick={() => void navigate(backPath(conversation))} />
        {identity ?? <span className="flex-1" />}
        {group && onOpenInfo ? <IconButton variant="plain" icon={Info} aria-label={t('chat.actions.groupInfo')} aria-haspopup="dialog" onClick={onOpenInfo} /> : null}
      </div>
      {/* Wrapped so the banner's `sticky` has no room to move: it stays inside the header. */}
      <div>
        <OfflineBanner className="mt-1" />
      </div>
    </header>
  )
}
