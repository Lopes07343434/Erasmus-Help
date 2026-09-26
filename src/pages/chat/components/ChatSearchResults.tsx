import { SearchX } from 'lucide-react'
import { ErrorState, StateView } from '@/components/feedback'
import { ListSection } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { MyProfile } from '@/services/chat/types'
import type { ChatSearch } from '../chatSearch'
import { ConversationRow } from './ConversationRow'
import { PeopleResults, PersonResultRow } from './PeopleSearch'

interface ChatSearchResultsProps {
  search: ChatSearch
  me: MyProfile
  now: Date
  /** Session offline: only my (cached) conversations can be searched. */
  offline: boolean
  /** Conversation open next to the list (desktop split view). */
  activeConversationId: string | null
}

/**
 * What replaces the tabs' content while the Chat search has text: "Conversas" and "Grupos" (mine, matched locally)
 * and "Pessoas" (the directory; a tap opens or starts the direct conversation). One "Sem resultados para «…»." when
 * nothing matches anywhere.
 */
export function ChatSearchResults({ search, me, now, offline, activeConversationId }: ChatSearchResultsProps) {
  const { t } = useI18n()
  const { query, direct, groups, people } = search

  if (query === null) return <p className="m-0 px-1 text-[13px] leading-[1.45] text-text3">{t('chat.search.hint')}</p>

  const local = direct.length + groups.length
  if (local === 0 && offline) return <ErrorState code="offline" />
  const noPeople = people.status === 'success' && people.results.length === 0
  if (local === 0 && noPeople) return <StateView icon={SearchX} textRole="status" title={t('chat.search.noResults', { query })} />

  const rows = (items: typeof direct) =>
    items.map((c) => <ConversationRow key={c.id} conversation={c} meId={me.id} now={now} active={c.id === activeConversationId} />)

  return (
    <div className="flex flex-col gap-5">
      {direct.length > 0 ? <ListSection title={t('chat.search.conversations')}>{rows(direct)}</ListSection> : null}
      {groups.length > 0 ? <ListSection title={t('chat.search.groups')}>{rows(groups)}</ListSection> : null}
      {offline ? (
        <p className="m-0 px-1 text-[13px] leading-[1.45] text-text3">{t('common.status.offlineBody')}</p>
      ) : noPeople ? null : (
        <PeopleResults
          search={people}
          title={t('chat.search.people')}
          titleAs="h2"
          hint={null}
          renderPerson={(person) => (
            <PersonResultRow
              person={person}
              onSelect={() => search.openPerson(person)}
              selectLabel={t('chat.search.openChatWith', { name: person.displayName })}
              busy={search.openingId === person.id}
            />
          )}
        />
      )}
    </div>
  )
}
