import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Archive, ArchiveRestore, CircleAlert, LogOut, Pencil, ShieldCheck, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { Button, IconButton, ListGroup, ListRow, ListSectionTitle, ListSwitchRow, Sheet, TextField, useToast } from '@/components/ui'
import { useGroupActions } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { CHAT_LIMITS, type ConversationSummary, type GroupMember, type MyProfile } from '@/services/chat/types'
import { sanitizeText } from '@/utils/validation'
import { chatErrorMessage } from '../chatErrors'
import { conversationTitle, publicIdLabel, sortMembers } from '../chatFormat'
import { chatTabPath } from '../chatPaths'
import { canDeleteGroup, canManageGroup } from '../chatPermissions'
import { useIdLookup } from '../useIdLookup'
import { ChatAvatar } from './ChatAvatar'
import { ConfirmSheet } from './ConfirmSheet'
import { IdLookupField, PersonCard } from './IdLookup'
import { MiniPill, RolePill } from './Pills'

export type GroupSheet = 'info' | 'rename' | 'add' | 'remove' | 'leave' | 'delete'

interface GroupSheetsProps {
  sheet: GroupSheet | null
  openSheet: (sheet: GroupSheet) => void
  closeSheet: () => void
  conversation: ConversationSummary
  members: readonly GroupMember[]
  me: MyProfile
}

/**
 * Group management, all as bottom sheets: info (participants + the actions this user may take) → rename · add
 * participant (ID lookup → confirm, optionally as manager) · remove (confirm) · leave (confirm) · delete (admin,
 * destructive confirm). Archive/unarchive runs from the info sheet. The server enforces the same permissions.
 */
export function GroupSheets({ sheet, openSheet, closeSheet, conversation, members, me }: GroupSheetsProps) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const actions = useGroupActions()
  const [target, setTarget] = useState<GroupMember | null>(null)
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
        onAdd={() => openSheet('add')}
        onRemove={(member) => {
          setTarget(member)
          openSheet('remove')
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
      <ConfirmSheet
        open={sheet === 'remove' && target !== null}
        onClose={backToInfo}
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
  onAdd: () => void
  onRemove: (member: GroupMember) => void
  onLeave: () => void
  onDelete: () => void
}

function GroupInfoSheet({ open, onClose, conversation, members, me, onRename, onAdd, onRemove, onLeave, onDelete }: GroupInfoSheetProps) {
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
    manage ? <ListRow key="rename" icon={Pencil} label={t('chat.group.rename')} onClick={onRename} /> : null,
    manage && !archived ? <ListRow key="add" icon={UserPlus} label={t('chat.group.addMember')} onClick={onAdd} /> : null,
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
    conversation.allowLeave ? <ListRow key="leave" icon={LogOut} tone="danger" label={t('chat.group.leave')} trailing="none" onClick={onLeave} /> : null,
    canDeleteGroup(me) ? <ListRow key="delete" icon={Trash2} tone="danger" label={t('chat.group.delete')} trailing="none" onClick={onDelete} /> : null,
  ].filter((row) => row !== null)

  return (
    <Sheet open={open} onClose={onClose} title={conversationTitle(conversation, i18n)}>
      <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-text3">
        <span>{tn('chat.participants', conversation.membersCount)}</span>
        {archived ? <MiniPill>{t('chat.list.archivedPill')}</MiniPill> : null}
      </p>

      {rows.length > 0 ? (
        <section aria-labelledby={actionsTitleId} className="flex flex-col gap-2">
          <ListSectionTitle id={actionsTitleId}>{t('chat.group.actions')}</ListSectionTitle>
          <ListGroup>{rows}</ListGroup>
        </section>
      ) : null}

      <section aria-labelledby={membersTitleId} className="flex flex-col gap-2 pb-1">
        <ListSectionTitle id={membersTitleId}>{t('chat.group.participants')}</ListSectionTitle>
        <ListGroup>
          {sorted.map((member) => {
            const isMe = member.id === me.id
            return (
              <ListRow
                key={member.id}
                leading={<ChatAvatar name={member.displayName} size={36} />}
                label={
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span className="break-words">{member.displayName}</span>
                    {isMe ? <MiniPill>{t('chat.group.you')}</MiniPill> : null}
                  </span>
                }
                description={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-medium">{publicIdLabel(member.publicId)}</span>
                    <RolePill role={member.role} />
                    {member.memberRole === 'manager' ? (
                      <MiniPill tone="primary">
                        <ShieldCheck size={11} aria-hidden="true" className="mr-1 shrink-0" />
                        {t('chat.group.manager')}
                      </MiniPill>
                    ) : null}
                  </span>
                }
                trailing={
                  manage && !isMe ? (
                    <IconButton
                      variant="plain"
                      icon={UserMinus}
                      aria-label={t('chat.group.removeMember', { name: member.displayName })}
                      onClick={() => onRemove(member)}
                      className="-mr-2"
                    />
                  ) : (
                    'none'
                  )
                }
              />
            )
          })}
        </ListGroup>
      </section>
    </Sheet>
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
  /** Offer "can also manage the group". */
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

function AddMemberForm({ conversationId, members, allowManager, onAdded, inputRef }: Omit<AddMemberSheetProps, 'open' | 'onClose'> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const actions = useGroupActions()
  const lookup = useIdLookup(actions.lookupByPublicId, {
    validate: (profile) => (members.some((m) => m.id === profile.id) ? t('chat.errors.already_member') : null),
  })
  const [asManager, setAsManager] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchedAgain, setSearchedAgain] = useState(false)
  const person = lookup.found

  const add = async () => {
    if (!person || busy) return
    setBusy(true)
    setError(null)
    try {
      await actions.addMember(conversationId, person.publicId, allowManager && asManager)
      onAdded(person.displayName)
    } catch (err) {
      setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
      setBusy(false)
    }
  }

  if (!person) {
    return (
      <div className="pb-1">
        <IdLookupField lookup={lookup} label={t('chat.lookup.idLabel')} inputRef={inputRef} autoFocus={searchedAgain} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <p className="m-0 text-[13px] font-semibold text-text2">{t('chat.lookup.confirmTitle')}</p>
      <PersonCard profile={person} />
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
      <div className="flex flex-col gap-2.5 pt-1">
        <Button icon={UserPlus} fullWidth loading={busy} onClick={() => void add()}>
          {t('chat.group.confirmAdd')}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          disabled={busy}
          onClick={() => {
            setError(null)
            setAsManager(false)
            setSearchedAgain(true)
            lookup.reset()
          }}
        >
          {t('chat.lookup.searchAgain')}
        </Button>
      </div>
    </div>
  )
}
