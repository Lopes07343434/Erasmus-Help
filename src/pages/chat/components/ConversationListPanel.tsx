import { useMemo } from 'react'
import { MessagesSquare, Plus, UserPlus, Users } from 'lucide-react'
import { EmptyState, ErrorState, StateView } from '@/components/feedback'
import { Button, ListGroup, ListSection } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { ConversationsState } from '@/services/chat/api'
import type { ConversationKind, MyProfile } from '@/services/chat/types'
import { ConversationListSkeleton, MyIdCard } from './ChatStates'
import { ConversationRow } from './ConversationRow'

interface ConversationListPanelProps {
  kind: ConversationKind
  /** useConversations(kind) — owned by the page, which also searches it. */
  list: ConversationsState
  me: MyProfile
  now: Date
  /** Session offline: keep showing whatever the list has cached. */
  offline?: boolean
  /** Conversation open next to the list (desktop split view). */
  activeConversationId?: string | null
  onAddPerson: () => void
  onCreateGroup: () => void
}

/**
 * Content of one Chat tab: the (realtime) list with its loading / error / offline / empty states. Empty states
 * carry the tab's action ("Adicionar pessoa" + my ID to share, or "Criar grupo").
 */
export function ConversationListPanel({ kind, list, me, now, offline = false, activeConversationId = null, onAddPerson, onCreateGroup }: ConversationListPanelProps) {
  const { t } = useI18n()
  const { active, archived } = useMemo(
    () => ({ active: list.items.filter((c) => c.archivedAt === null), archived: list.items.filter((c) => c.archivedAt !== null) }),
    [list.items],
  )
  const row = (id: string) => ({ meId: me.id, now, active: id === activeConversationId })

  if (list.items.length === 0) {
    if (list.status === 'loading') return <ConversationListSkeleton />
    if (offline) return <ErrorState code="offline" onRetry={list.refresh} />
    if (list.status === 'error') return <ErrorState error={list.error ?? undefined} onRetry={list.refresh} />
    return kind === 'direct' ? (
      <div className="flex flex-col gap-3.5">
        <StateView
          icon={MessagesSquare}
          title={t('chat.empty.directTitle')}
          body={t('chat.empty.directBody')}
          className="pb-6"
          action={
            <Button variant="secondary" size="sm" icon={UserPlus} onClick={onAddPerson}>
              {t('chat.actions.addPerson')}
            </Button>
          }
        />
        <MyIdCard me={me} />
      </div>
    ) : (
      <EmptyState
        icon={Users}
        title={t('chat.empty.groupsTitle')}
        body={t('chat.empty.groupsCreateBody')}
        action={{ label: t('chat.actions.createGroup'), icon: Plus, onClick: onCreateGroup }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3.5">
      {active.length > 0 ? (
        <ListGroup>
          {active.map((c) => (
            <ConversationRow key={c.id} conversation={c} {...row(c.id)} />
          ))}
        </ListGroup>
      ) : null}
      {archived.length > 0 ? (
        <ListSection title={t('chat.list.archived')}>
          {archived.map((c) => (
            <ConversationRow key={c.id} conversation={c} {...row(c.id)} />
          ))}
        </ListSection>
      ) : null}
    </div>
  )
}
