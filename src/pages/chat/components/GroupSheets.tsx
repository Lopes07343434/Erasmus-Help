import { useId, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Archive, ArchiveRestore, CircleAlert, LogOut, Pencil, ShieldCheck, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { Button, ListGroup, ListRow, ListSectionTitle, ListSwitchRow, Sheet, Skeleton, TextField, useToast } from '@/components/ui'
import { useDirectChats, useGroupActions, usePeopleSearch } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { CHAT_LIMITS, type ConversationSummary, type GroupMember, type MyProfile, type PersonSearchResult } from '@/services/chat/types'
import { sanitizeText } from '@/utils/validation'
import { chatErrorMessage } from '../chatErrors'
import { conversationTitle, sortMembers } from '../chatFormat'
import { chatTabPath, conversationPath } from '../chatPaths'
import { canDeleteGroup, canManageGroup } from '../chatPermissions'
import { ChatAvatar } from './ChatAvatar'
import { ConfirmSheet } from './ConfirmSheet'
import { canChangeMemberRole, canLeaveGroup, canRemoveMember, publicIdNumber } from './groupMembers'
import { MemberSheet } from './MemberSheet'
import { PeopleResults, PeopleSearchField, PersonResultRow } from './PeopleSearch'
import { PhotoEditButton, PhotoSheet } from './PhotoSheet'
import { MiniPill, RolePill } from './Pills'

export type GroupSheet = 'info' | 'rename' | 'photo' | 'add' | 'member' | 'remove' | 'leave' | 'delete'

interface GroupSheetsProps {
  sheet: GroupSheet | null
  openSheet: (sheet: GroupSheet) => void
  closeSheet: () => void
  conversation: ConversationSummary
  members: readonly GroupMember[]
  me: MyProfile
}

/**
 * Group management, all as bottom sheets. Info (photo, name, participants and the actions this user may take) →
 * rename · photo (change/remove) · add member (live people search, optionally as administrator) · one participant
 * (send a message; administrators: promote/demote, remove → confirm) · leave (confirm) · delete (platform admin,
 * destructive confirm). Archive/unarchive runs from the info sheet. The server enforces the same permissions.
 */
export function GroupSheets({ sheet, openSheet, closeSheet, conversation, members, me }: GroupSheetsProps) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const actions = useGroupActions()
  const directChats = useDirectChats()
  /** Participant picked in the info sheet (snapshot: still named in the remove confirmation once they are gone). */
  const [target, setTarget] = useState<GroupMember | null>(null)
  const liveTarget = target ? (members.find((m) => m.id === target.id) ?? null) : null
  const manage = canManageGroup(me, conversation)
  const id = conversation.id
  const backToInfo = () => openSheet('info')
  const errorMessage = (err: unknown) => chatErrorMessage(err, i18n)

  const leaveToList = (message: string) => {
    toast.show(message)
    closeSheet()
    void navigate(chatTabPath('grupos'), { replace: true })
  }

  return (
    <>
      <GroupInfoSheet
        open={sheet === 'info'}
        onClose={closeSheet}
        conversation={conversation}
        members={members}
        me={me}
        onRename={() => openSheet('rename')}
        onPhoto={() => openSheet('photo')}
        onAdd={() => openSheet('add')}
        onMember={(member) => {
          setTarget(member)
          openSheet('member')
        }}
        onLeave={() => openSheet('leave')}
        onDelete={() => openSheet('delete')}
      />
      <RenameGroupSheet
        open={sheet === 'rename'}
        onClose={backToInfo}
        currentName={conversation.name ?? ''}
        onSave={async (name) => {
          await actions.renameGroup(id, name)
          toast.show(t('chat.group.renamed'))
          backToInfo()
        }}
      />
      <PhotoSheet
        open={sheet === 'photo'}
        onClose={backToInfo}
        labels={{
          title: t('chat.group.photo'),
          choose: t('chat.group.choosePhoto'),
          remove: t('chat.group.removePhoto'),
          saving: t('chat.group.photoSaving'),
          invalid: t('chat.group.photoInvalid'),
        }}
        photo={conversation.avatarPath}
        group
        onSave={async (image) => {
          await actions.setGroupAvatar(id, image)
          toast.show(t(image ? 'chat.group.photoUpdated' : 'chat.group.photoRemoved'))
          backToInfo()
        }}
        errorMessage={errorMessage}
      />
      <AddMemberSheet
        open={sheet === 'add'}
        onClose={backToInfo}
        conversationId={id}
        members={members}
        allowManager={manage}
        onAdded={(name) => {
          toast.show(t('chat.group.memberAdded', { name }))
          backToInfo()
        }}
      />
      <MemberSheet
        open={sheet === 'member'}
        onClose={backToInfo}
        member={liveTarget}
        canChangeRole={liveTarget !== null && canChangeMemberRole(me, conversation, liveTarget)}
        canRemove={liveTarget !== null && canRemoveMember(me, conversation, liveTarget)}
        onMessage={async (member) => {
          const conversationId = await directChats.startDirectConversation(member.publicId)
          closeSheet()
          void navigate(conversationPath(conversationId))
        }}
        onSetRole={async (member, role) => {
          await actions.setMemberRole(id, member.id, role)
          toast.show(t(role === 'manager' ? 'chat.group.madeAdmin' : 'chat.group.removedAdmin', { name: member.displayName }))
          backToInfo()
        }}
        onRemove={() => openSheet('remove')}
        errorMessage={errorMessage}
      />
      <ConfirmSheet
        open={sheet === 'remove' && target !== null}
        onClose={() => openSheet(liveTarget ? 'member' : 'info')}
        title={t('chat.group.removeTitle')}
        body={t('chat.group.removeBody', { name: target?.displayName ?? '' })}
        confirmLabel={t('chat.group.removeConfirm')}
        confirmIcon={UserMinus}
        errorMessage={errorMessage}
        onConfirm={async () => {
          if (!target) return
          await actions.removeMember(id, target.id)
          toast.show(t('chat.group.memberRemoved', { name: target.displayName }))
          backToInfo()
        }}
      />
      <ConfirmSheet
        open={sheet === 'leave'}
        onClose={backToInfo}
        title={t('chat.group.leaveTitle')}
        body={t('chat.group.leaveBody')}
        confirmLabel={t('chat.group.leaveConfirm')}
        confirmIcon={LogOut}
        errorMessage={errorMessage}
        onConfirm={async () => {
          await actions.leaveGroup(id)
          leaveToList(t('chat.group.left'))
        }}
      />
      <ConfirmSheet
        open={sheet === 'delete'}
        onClose={backToInfo}
        title={t('chat.group.deleteTitle')}
        body={t('chat.group.deleteBody')}
        warning={t('chat.group.deleteWarning')}
        confirmLabel={t('chat.group.deleteConfirm')}
        confirmIcon={Trash2}
        errorMessage={errorMessage}
        onConfirm={async () => {
          await actions.deleteGroup(id)
          leaveToList(t('chat.group.deleted'))
        }}
      />
    </>
  )
}

interface GroupInfoSheetProps {
  open: boolean
  onClose: () => void
  conversation: ConversationSummary
  members: readonly GroupMember[]
  me: MyProfile
  onRename: () => void
  onPhoto: () => void
  onAdd: () => void
  onMember: (member: GroupMember) => void
  onLeave: () => void
  onDelete: () => void
}

function GroupInfoSheet({ open, onClose, conversation, members, me, onRename, onPhoto, onAdd, onMember, onLeave, onDelete }: GroupInfoSheetProps) {
  const i18n = useI18n()
  const { t, tn, locale } = i18n
  const toast = useToast()
  const actions = useGroupActions()
  const actionsTitleId = useId()
  const membersTitleId = useId()
  const [archiving, setArchiving] = useState(false)
  const manage = canManageGroup(me, conversation)
  const archived = conversation.archivedAt !== null
  const sorted = sortMembers(members, locale)
  const others = members.filter((m) => m.id !== me.id)
  // The summary knows the count before the participant list has loaded.
  const loadingMembers = others.length === 0 && conversation.membersCount > 1

  const toggleArchive = async () => {
    if (archiving) return
    setArchiving(true)
    try {
      await actions.setArchived(conversation.id, !archived)
      toast.show(t(archived ? 'chat.group.unarchived' : 'chat.group.archived'))
    } catch (err) {
      toast.show(chatErrorMessage(err, i18n), { icon: CircleAlert, duration: 3200 })
    } finally {
      setArchiving(false)
    }
  }

  const rows = [
    manage && !archived ? <ListRow key="add" icon={UserPlus} label={t('chat.group.addMember')} onClick={onAdd} /> : null,
    manage ? <ListRow key="rename" icon={Pencil} label={t('chat.group.rename')} onClick={onRename} /> : null,
    manage ? (
      <ListRow
        key="archive"
        icon={archived ? ArchiveRestore : Archive}
        label={t(archived ? 'chat.group.unarchive' : 'chat.group.archive')}
        description={archived ? undefined : t('chat.group.archiveHint')}
        disabled={archiving}
        trailing="none"
        onClick={() => void toggleArchive()}
      />
    ) : null,
    canLeaveGroup(me, conversation) ? <ListRow key="leave" icon={LogOut} tone="danger" label={t('chat.group.leave')} trailing="none" onClick={onLeave} /> : null,
    canDeleteGroup(me) ? <ListRow key="delete" icon={Trash2} tone="danger" label={t('chat.group.delete')} trailing="none" onClick={onDelete} /> : null,
  ].filter((row) => row !== null)

  const avatar = <ChatAvatar group photo={conversation.avatarPath} size={64} />

  let participants
  if (loadingMembers) {
    participants = (
      <div role="status" aria-busy="true" className="glass overflow-hidden rounded-card">
        <span className="sr-only">{t('common.status.loading')}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
            <Skeleton width={36} height={36} radius={18} delay={i * 0.08} />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton width={`${58 - i * 8}%`} height={14} delay={i * 0.08} />
              <Skeleton width={64} height={12} delay={i * 0.08 + 0.1} />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (others.length === 0) {
    participants = <p className="m-0 mx-1 text-sm leading-[1.45] text-text2">{t('chat.group.emptyGroup')}</p>
  } else {
    participants = (
      <ListGroup>
        {sorted.map((member) => (
          <MemberRow key={member.id} member={member} isMe={member.id === me.id} onOpen={member.id === me.id ? undefined : () => onMember(member)} />
        ))}
      </ListGroup>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={conversationTitle(conversation, i18n)}>
      <div className="flex items-center gap-3.5">
        {manage && !archived ? (
          <PhotoEditButton label={t(conversation.avatarPath ? 'chat.group.changePhoto' : 'chat.group.addPhoto')} onClick={onPhoto}>
            {avatar}
          </PhotoEditButton>
        ) : (
          avatar
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] font-semibold text-text2">
            <span>{tn('chat.participants', conversation.membersCount)}</span>
            {archived ? <MiniPill>{t('chat.list.archivedPill')}</MiniPill> : null}
          </p>
          <p className="m-0 text-[13px] leading-[1.4] text-pretty text-text3">{t('chat.group.adminHint')}</p>
        </div>
      </div>

      {rows.length > 0 ? (
        <section aria-labelledby={actionsTitleId} className="flex flex-col gap-2">
          <ListSectionTitle id={actionsTitleId}>{t('chat.group.actions')}</ListSectionTitle>
          <ListGroup>{rows}</ListGroup>
        </section>
      ) : null}

      <section aria-labelledby={membersTitleId} className="flex flex-col gap-2 pb-1">
        <ListSectionTitle id={membersTitleId}>{t('chat.group.participants')}</ListSectionTitle>
        {participants}
      </section>
    </Sheet>
  )
}

/** "Samuel Lopes ID: 15" (+ "Tu") over the role pill (+ "Administrador"). Other participants open their options. */
function MemberRow({ member, isMe, onOpen }: { member: GroupMember; isMe: boolean; onOpen?: () => void }) {
  const { t } = useI18n()
  const id = publicIdNumber(member.publicId)
  return (
    <ListRow
      leading={<ChatAvatar name={member.displayName} photo={member.avatarPath} size={36} />}
      label={
        // Inline flow (not flex) so the ID follows a long name on the same line when it fits.
        <span className="leading-[1.35]">
          <span className="font-semibold">{member.displayName}</span>
          {id ? <span className="ml-1.5 font-mono text-[13px] font-medium text-primary tabular-nums">{`ID: ${id}`}</span> : null}
          {isMe ? <MiniPill className="ml-1.5 align-[1px]">{t('chat.group.you')}</MiniPill> : null}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <RolePill role={member.role} />
          {member.memberRole === 'manager' ? (
            <MiniPill tone="primary">
              <ShieldCheck size={11} aria-hidden="true" className="mr-1 shrink-0" />
              {t('chat.group.manager')}
            </MiniPill>
          ) : null}
        </span>
      }
      onClick={onOpen}
    />
  )
}

interface RenameGroupSheetProps {
  open: boolean
  onClose: () => void
  currentName: string
  onSave: (name: string) => Promise<void>
}

function RenameGroupSheet({ open, onClose, currentName, onSave }: RenameGroupSheetProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.group.rename')} initialFocusRef={inputRef}>
      <RenameForm currentName={currentName} onSave={onSave} onClose={onClose} inputRef={inputRef} />
    </Sheet>
  )
}

function RenameForm({ currentName, onSave, onClose, inputRef }: Omit<RenameGroupSheetProps, 'open'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const [value, setValue] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const clean = sanitizeText(value, CHAT_LIMITS.groupNameMaxLength)
    if (!clean) return setError(t('chat.createGroup.nameRequired'))
    if (clean === currentName) return onClose()
    setBusy(true)
    try {
      await onSave(clean)
    } catch (err) {
      setError(chatErrorMessage(err, i18n))
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 pb-1">
      <TextField
        ref={inputRef}
        label={t('chat.group.nameLabel')}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        maxLength={CHAT_LIMITS.groupNameMaxLength}
        autoComplete="off"
        enterKeyHint="done"
        error={error}
      />
      <Button type="submit" fullWidth loading={busy}>
        {t('common.actions.save')}
      </Button>
    </form>
  )
}

interface AddMemberSheetProps {
  open: boolean
  onClose: () => void
  conversationId: string
  members: readonly GroupMember[]
  /** Offer "also a group administrator". */
  allowManager: boolean
  onAdded: (name: string) => void
}

function AddMemberSheet({ open, onClose, ...rest }: AddMemberSheetProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.group.addMember')} initialFocusRef={inputRef}>
      <AddMemberForm {...rest} inputRef={inputRef} />
    </Sheet>
  )
}

/**
 * Same flow as "Adicionar pessoa": live search by ID or name, "Adicionar" on a result (Enter picks the exact ID).
 * People already in the group are listed greyed out with a note. Optionally added as administrator.
 */
function AddMemberForm({ conversationId, members, allowManager, onAdded, inputRef }: Omit<AddMemberSheetProps, 'open' | 'onClose'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const actions = useGroupActions()
  const [query, setQuery] = useState('')
  const search = usePeopleSearch(query)
  const [asManager, setAsManager] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  const add = async (person: PersonSearchResult) => {
    if (busyId !== null || memberIds.has(person.id)) return
    setBusyId(person.id)
    setError(null)
    try {
      await actions.addMember(conversationId, person.publicId, allowManager && asManager)
      onAdded(person.displayName)
    } catch (err) {
      setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
      setBusyId(null)
    }
  }

  const exact = search.status === 'success' ? search.results.find((p) => p.exactIdMatch) : undefined

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <PeopleSearchField
        value={query}
        onChange={(value) => {
          setQuery(value)
          setError(null)
        }}
        label={t('chat.addPerson.idLabel')}
        inputRef={inputRef}
        onSubmit={() => {
          if (exact) void add(exact)
        }}
      />
      {allowManager ? (
        <ListGroup>
          <ListSwitchRow icon={ShieldCheck} label={t('chat.group.asManager')} description={t('chat.group.asManagerHint')} checked={asManager} onCheckedChange={setAsManager} />
        </ListGroup>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <PeopleResults
        search={search}
        title={t('chat.addPerson.results')}
        renderPerson={(person) => {
          const already = memberIds.has(person.id)
          return (
            <PersonResultRow
              person={person}
              disabledNote={already ? t('chat.errors.already_member') : undefined}
              action={
                already ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={UserPlus}
                    loading={busyId === person.id}
                    disabled={busyId !== null && busyId !== person.id}
                    aria-label={t('chat.group.addAria', { name: person.displayName })}
                    onClick={() => void add(person)}
                    className="shrink-0"
                  >
                    {t('chat.addPerson.add')}
                  </Button>
                )
              }
            />
          )
        }}
      />
    </div>
  )
}
