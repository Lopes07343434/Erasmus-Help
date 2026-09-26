import { useId, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { Plus, Users, X } from 'lucide-react'
import { Button, IconButton, ListGroup, ListSwitchRow, Sheet, TextField, useToast } from '@/components/ui'
import { useGroupActions } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { CHAT_LIMITS, type MyProfile, type PublicProfile } from '@/services/chat/types'
import { sanitizeText } from '@/utils/validation'
import { chatErrorMessage } from '../chatErrors'
import { publicIdLabel } from '../chatFormat'
import { conversationPath } from '../chatPaths'
import { useIdLookup } from '../useIdLookup'
import { ChatAvatar } from './ChatAvatar'
import { IdLookupField } from './IdLookup'
import { RolePill } from './Pills'

interface CreateGroupSheetProps {
  open: boolean
  onClose: () => void
  me: MyProfile
}

/** Admins / verified monitors with "pode gerir grupos": name + participants by ID + "can leave" → create → open it. */
export function CreateGroupSheet({ open, onClose, me }: CreateGroupSheetProps) {
  const { t } = useI18n()
  const nameRef = useRef<HTMLInputElement>(null)
  return (
    <Sheet open={open} onClose={onClose} title={t('chat.createGroup.title')} initialFocusRef={nameRef}>
      <CreateGroupForm me={me} onClose={onClose} nameRef={nameRef} />
    </Sheet>
  )
}

function CreateGroupForm({ me, onClose, nameRef }: { me: MyProfile; onClose: () => void; nameRef: RefObject<HTMLInputElement | null> }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const actions = useGroupActions()
  const membersTitleId = useId()
  const idRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [members, setMembers] = useState<PublicProfile[]>([])
  const [allowLeave, setAllowLeave] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxMembers = CHAT_LIMITS.groupCreateMaxMembers

  const lookup = useIdLookup(actions.lookupByPublicId, {
    validate: (profile) =>
      profile.id === me.id
        ? t('chat.createGroup.isYou')
        : members.some((m) => m.id === profile.id)
          ? t('chat.createGroup.alreadyAdded')
          : members.length >= maxMembers
            ? t('chat.createGroup.tooMany', { max: maxMembers })
            : null,
  })

  const addMember = (profile: PublicProfile) => {
    setMembers((list) => (list.some((m) => m.id === profile.id) ? list : [...list, profile]))
    lookup.reset()
  }

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
      const conversationId = await actions.createGroup({ name: clean, memberPublicIds: members.map((m) => m.publicId), allowLeave })
      toast.show(t('chat.createGroup.created'))
      onClose()
      void navigate(conversationPath(conversationId))
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
          idRef.current?.focus()
        }}
        maxLength={CHAT_LIMITS.groupNameMaxLength}
        autoComplete="off"
        enterKeyHint="next"
        error={nameError}
      />

      <section aria-labelledby={membersTitleId} className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <h3 id={membersTitleId} className="m-0 text-[15px] font-semibold">
            {t('chat.createGroup.members')}
          </h3>
          <p className="m-0 text-[13px] leading-[1.4] text-text3">{t('chat.createGroup.membersHint')}</p>
        </div>
        {members.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {members.map((m) => (
              <li key={m.id} className="flex min-h-12 items-center gap-3 rounded-chip border border-solid border-border bg-surface py-1 pr-1 pl-2">
                <ChatAvatar name={m.displayName} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{m.displayName}</span>
                  <span className="flex items-center gap-1.5 text-xs text-text3">
                    <RolePill role={m.role} />
                    <span className="font-mono">{publicIdLabel(m.publicId)}</span>
                  </span>
                </span>
                <IconButton
                  variant="plain"
                  icon={X}
                  iconSize={18}
                  aria-label={t('chat.createGroup.remove', { name: m.displayName })}
                  onClick={() => setMembers((list) => list.filter((x) => x.id !== m.id))}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <IdLookupField lookup={lookup} label={t('chat.createGroup.idLabel')} actionLabel={t('chat.createGroup.add')} onFound={addMember} inputRef={idRef} />
      </section>

      <ListGroup>
        <ListSwitchRow icon={Users} label={t('chat.createGroup.allowLeave')} checked={allowLeave} onCheckedChange={setAllowLeave} />
      </ListGroup>

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
