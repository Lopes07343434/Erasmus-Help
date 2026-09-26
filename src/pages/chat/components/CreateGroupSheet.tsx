import { useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { CircleCheck, Plus, Users, X } from 'lucide-react'
import { Button, IconButton, ListGroup, ListSwitchRow, Sheet, TextField, useToast } from '@/components/ui'
import { useChatSession, useGroupActions, usePeopleSearch } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { CHAT_LIMITS, formatPublicIdNumber, isPublicIdQuery, type PublicProfile } from '@/services/chat/types'
import { sanitizeText } from '@/utils/validation'
import { chatErrorMessage } from '../chatErrors'
import { conversationPath } from '../chatPaths'
import { isAdmin } from '../chatPermissions'
import { useExactMatchSubmit } from '../chatSearch'
import { PeopleResults, PeopleSearchField, PersonResultRow } from './PeopleSearch'

interface CreateGroupSheetProps {
  open: boolean
  onClose: () => void
}

/** Anyone (the creator becomes the group's administrator): name + participants picked by ID or name → create → open it. */
export function CreateGroupSheet({ open, onClose }: CreateGroupSheetProps) {
  const { t } = useI18n()
  const nameRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.createGroup.title')} initialFocusRef={nameRef}>
      <CreateGroupForm onClose={onClose} nameRef={nameRef} />
    </Sheet>
  )
}

function CreateGroupForm({ onClose, nameRef }: { onClose: () => void; nameRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t, tn } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const actions = useGroupActions()
  // Groups nobody can leave are reserved to platform admins (the server refuses them for everyone else).
  const canLockGroup = isAdmin(useChatSession().me)
  const participantsTitleId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedListRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const search = usePeopleSearch(query)
  // Kept across searches, in the order they were picked.
  const [selected, setSelected] = useState<PublicProfile[]>([])
  const [limitError, setLimitError] = useState<string | null>(null)
  const [allowLeave, setAllowLeave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected])
  const maxMembers = CHAT_LIMITS.groupCreateMaxMembers

  const deselect = (id: string) => {
    setLimitError(null)
    setSelected((list) => list.filter((p) => p.id !== id))
  }
  const select = (person: PublicProfile) => {
    if (selectedIds.has(person.id)) return
    if (selected.length >= maxMembers) return setLimitError(t('chat.createGroup.tooMany', { max: maxMembers }))
    const { id, publicId, displayName, role, avatarPath } = person
    setSelected((list) => [...list, { id, publicId, displayName, role, avatarPath }])
  }
  const toggle = (person: PublicProfile) => (selectedIds.has(person.id) ? deselect(person.id) : select(person))
  // The removed row's button disappears: keep the keyboard focus nearby (next row, else the search field).
  const removeAt = (id: string, index: number) => {
    deselect(id)
    requestAnimationFrame(() => {
      const buttons = selectedListRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
      ;(buttons[Math.min(index, buttons.length - 1)] ?? searchRef.current)?.focus()
    })
  }
  // Enter in the search: select the exact-ID match and clear the field for the next one.
  const submitSearch = useExactMatchSubmit(search, (person) => {
    select(person)
    setQuery('')
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const clean = sanitizeText(name, CHAT_LIMITS.groupNameMaxLength)
    if (!clean) {
      setNameError(t('chat.createGroup.nameRequired'))
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const conversationId = await actions.createGroup({ name: clean, memberPublicIds: selected.map((p) => p.publicId), allowLeave })
      toast.show(t('chat.createGroup.created'))
      onClose()
      void navigate(conversationPath(conversationId, 'grupos'))
    } catch (err) {
      setError(chatErrorMessage(err, i18n))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 pb-1">
      <TextField
        ref={nameRef}
        label={t('chat.createGroup.nameLabel')}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setNameError(null)
        }}
        onKeyDown={(e) => {
          // Enter moves on to the participants instead of creating the group right away.
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          e.preventDefault()
          searchRef.current?.focus()
        }}
        maxLength={CHAT_LIMITS.groupNameMaxLength}
        autoComplete="off"
        enterKeyHint="next"
        error={nameError}
      />

      <div className="flex flex-col gap-2.5">
        <PeopleSearchField
          value={query}
          onChange={setQuery}
          label={t('chat.createGroup.addParticipants')}
          description={t('chat.createGroup.membersHint')}
          inputRef={searchRef}
          onSubmit={submitSearch}
        />
        <PeopleResults
          search={search}
          title={t('chat.addPerson.results')}
          hint={null}
          renderPerson={(person) => (
            <PersonResultRow person={person} layout={isPublicIdQuery(query) ? 'id' : 'name'} selected={selectedIds.has(person.id)} onToggle={toggle} />
          )}
        />
        {limitError ? (
          <p role="alert" className="m-0 px-1 text-sm font-semibold text-danger">
            {limitError}
          </p>
        ) : null}
      </div>

      <section aria-labelledby={participantsTitleId} className="flex flex-col gap-2">
        <div className="mx-1 flex items-baseline justify-between gap-3">
          <h3 id={participantsTitleId} className="m-0 text-[13px] font-semibold tracking-[.04em] text-text3 uppercase">
            {t('chat.createGroup.selected')}
          </h3>
          <span aria-live="polite" className="text-[13px] font-semibold text-primary tabular-nums">
            {selected.length > 0 ? tn('chat.createGroup.selectedCount', selected.length) : ''}
          </span>
        </div>
        {selected.length > 0 ? (
          <div ref={selectedListRef}>
            <ListGroup>
              {selected.map((p, index) => (
                <div key={p.id} className="flex min-h-12 items-center gap-2.5 py-0.5 pr-1 pl-4">
                  <CircleCheck size={18} aria-hidden="true" className="shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm leading-[1.3]">
                    <span className="shrink-0 font-mono text-[13px] font-medium text-primary tabular-nums">{formatPublicIdNumber(p.publicId)}</span>
                    <span aria-hidden="true" className="shrink-0 text-text3">
                      —
                    </span>
                    <span className="min-w-0 truncate font-semibold">{p.displayName}</span>
                  </span>
                  <IconButton
                    variant="plain"
                    icon={X}
                    iconSize={18}
                    aria-label={t('chat.createGroup.deselect', { name: p.displayName })}
                    onClick={() => removeAt(p.id, index)}
                  />
                </div>
              ))}
            </ListGroup>
          </div>
        ) : (
          <p className="m-0 px-1 text-[13px] leading-[1.45] text-text3">{t('chat.createGroup.noneSelected')}</p>
        )}
      </section>

      {canLockGroup ? (
        <ListGroup>
          <ListSwitchRow icon={Users} label={t('chat.createGroup.allowLeave')} checked={allowLeave} onCheckedChange={setAllowLeave} />
        </ListGroup>
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" icon={Plus} fullWidth loading={busy}>
        {t('chat.createGroup.create')}
      </Button>
    </form>
  )
}
