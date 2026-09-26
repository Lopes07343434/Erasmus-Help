import { useMemo } from 'react'
import { MessagesSquare, Plus, UserPlus, Users } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/feedback'
import { Button, ListGroup, ListSection } from '@/components/ui'
import { useConversations } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import type { ConversationKind, MyProfile } from '@/services/chat/types'
import { useNow } from '../chatHooks'
import { canAddStudents, canCreateGroups, isPendingMonitor } from '../chatPermissions'
import { ConversationListSkeleton, PendingMonitorBanner, StudentNoMonitor } from './ChatStates'
import { ConversationRow } from './ConversationRow'

interface ConversationListPanelProps {
  kind: ConversationKind
  me: MyProfile
  /** Session offline: keep showing whatever the list has cached. */
  offline?: boolean
  onAddStudent: () => void
  onCreateGroup: () => void
}

/** Content of one Chat tab: role banners, the tab's action, the (realtime) list with its loading/error/empty states. */
export function ConversationListPanel({ kind, me, offline = false, onAddStudent, onCreateGroup }: ConversationListPanelProps) {
  const { t } = useI18n()
  const list = useConversations(kind)
  const now = useNow()
  const direct = kind === 'direct'
  const { active, archived } = useMemo(
    () => ({ active: list.items.filter((c) => c.archivedAt === null), archived: list.items.filter((c) => c.archivedAt !== null) }),
    [list.items],
  )
  const hasItems = list.items.length > 0

  const action = direct
    ? canAddStudents(me)
      ? { label: t('chat.actions.addStudent'), icon: UserPlus, onClick: onAddStudent }
      : null
    : canCreateGroups(me)
      ? { label: t('chat.actions.createGroup'), icon: Plus, onClick: onCreateGroup }
      : null

  let body
  if (!hasItems && list.status === 'loading') {
    body = <ConversationListSkeleton />
  } else if (!hasItems && (offline || list.status === 'error')) {
    body = offline ? <ErrorState code="offline" onRetry={list.refresh} /> : <ErrorState error={list.error ?? undefined} onRetry={list.refresh} />
  } else if (!hasItems) {
    body = direct ? (
      me.role === 'student' ? (
        <StudentNoMonitor me={me} />
      ) : me.role === 'monitor' ? (
        <EmptyState
          icon={MessagesSquare}
          title={t('chat.empty.monitorTitle')}
          body={t('chat.empty.monitorBody')}
          action={action ? { label: action.label, icon: action.icon, onClick: action.onClick } : undefined}
        />
      ) : (
        <EmptyState icon={MessagesSquare} title={t('chat.empty.directTitle')} body={t('chat.empty.directBody')} />
      )
    ) : (
      <EmptyState
        icon={Users}
        title={t('chat.empty.groupsTitle')}
        body={action ? t('chat.empty.groupsCreateBody') : t('chat.empty.groupsBody')}
        action={action ? { label: action.label, icon: action.icon, onClick: action.onClick } : undefined}
      />
    )
  } else {
    body = (
      <>
        {action ? (
          <Button variant="secondary" size="sm" icon={action.icon} onClick={action.onClick} className="self-end">
            {action.label}
          </Button>
        ) : null}
        {active.length > 0 ? (
          <ListGroup>
            {active.map((c) => (
              <ConversationRow key={c.id} conversation={c} meId={me.id} now={now} />
            ))}
          </ListGroup>
        ) : null}
        {archived.length > 0 ? (
          <ListSection title={t('chat.list.archived')}>
            {archived.map((c) => (
              <ConversationRow key={c.id} conversation={c} meId={me.id} now={now} />
            ))}
          </ListSection>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {isPendingMonitor(me) ? <PendingMonitorBanner /> : null}
      {body}
    </div>
  )
}
