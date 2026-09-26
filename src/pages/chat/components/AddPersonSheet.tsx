import { useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Button, Sheet, useToast } from '@/components/ui'
import { useDirectChats, usePeopleSearch } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { isPublicIdQuery, parsePublicId, type MyProfile, type PersonSearchResult } from '@/services/chat/types'
import { chatErrorMessage } from '../chatErrors'
import { conversationPath } from '../chatPaths'
import { useExactMatchSubmit } from '../chatSearch'
import { PeopleResults, PeopleSearchField, PersonResultRow } from './PeopleSearch'

interface AddPersonSheetProps {
  open: boolean
  onClose: () => void
  me: MyProfile
}

/** Anyone: someone's ID (or name) → live results → "Adicionar" opens (or creates) the direct conversation. */
export function AddPersonSheet({ open, onClose, me }: AddPersonSheetProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.addPerson.title')} initialFocusRef={inputRef}>
      <AddPersonForm me={me} onClose={onClose} inputRef={inputRef} />
    </Sheet>
  )
}

function AddPersonForm({ me, onClose, inputRef }: { me: MyProfile; onClose: () => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const directChats = useDirectChats()
  const [query, setQuery] = useState('')
  const search = usePeopleSearch(query)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idQuery = isPublicIdQuery(query)
  // Search results never include me: typing my own ID deserves an explanation rather than "not found".
  const isMe = idQuery && parsePublicId(query) === me.publicId
  const onlyExact = search.status === 'success' && search.results.length === 1 && search.results[0]?.exactIdMatch === true

  const add = (person: PersonSearchResult) => {
    if (busyId) return
    setBusyId(person.id)
    setError(null)
    directChats.startDirectConversation(person.publicId).then(
      (conversationId) => {
        toast.show(t('chat.addPerson.added', { name: person.displayName }))
        onClose()
        void navigate(conversationPath(conversationId))
      },
      (err: unknown) => {
        setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
        setBusyId(null)
      },
    )
  }
  const submit = useExactMatchSubmit(search, add)

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <p className="m-0 text-sm leading-[1.5] text-pretty text-text2">{t('chat.addPerson.body')}</p>
      <PeopleSearchField
        value={query}
        onChange={(value) => {
          setQuery(value)
          setError(null)
        }}
        label={t('chat.addPerson.idLabel')}
        description={t('chat.search.hint')}
        inputRef={inputRef}
        onSubmit={submit}
      />
      {isMe && search.results.length > 0 ? (
        <p role="status" className="m-0 px-1 text-sm font-semibold text-text2">
          {t('chat.addPerson.isYou')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 px-1 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <PeopleResults
        search={search}
        title={onlyExact ? t('chat.addPerson.found') : t('chat.addPerson.results')}
        hint={null}
        emptyText={isMe ? t('chat.addPerson.isYou') : idQuery ? t('chat.errors.not_found') : undefined}
        renderPerson={(person) => (
          <PersonResultRow
            person={person}
            action={
              <Button
                variant="secondary"
                size="sm"
                loading={busyId === person.id}
                disabled={busyId !== null && busyId !== person.id}
                aria-label={t('chat.addPerson.addAria', { name: person.displayName })}
                onClick={() => add(person)}
                className="shrink-0"
              >
                {t('chat.addPerson.add')}
              </Button>
            }
          />
        )}
      />
    </div>
  )
}
