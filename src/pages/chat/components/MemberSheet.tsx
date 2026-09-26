import { useState } from 'react'
import { MessageCircle, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react'
import { Button, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { GroupMember, MemberRole } from '@/services/chat/types'
import { PersonCard } from './PersonCard'
import { MiniPill } from './Pills'

interface MemberSheetProps {
  open: boolean
  onClose: () => void
  /** The participant tapped in the group info (live: its role updates while the sheet is open). */
  member: GroupMember | null
  /** Group administrators: "Tornar administrador" / "Retirar administrador". */
  canChangeRole: boolean
  /** Group administrators: "Remover do grupo" (opens the confirmation). */
  canRemove: boolean
  /** Opens (or creates) the direct conversation with this person. */
  onMessage: (member: GroupMember) => Promise<void>
  onSetRole: (member: GroupMember, role: MemberRole) => Promise<void>
  onRemove: (member: GroupMember) => void
  errorMessage: (err: unknown) => string
}

/**
 * Options for one participant: who it is (photo, name, role, ID, administrator pill), "Enviar mensagem" for everyone,
 * and for group administrators promote/demote and remove. Failures (e.g. "the group needs an administrator") show
 * inline; on success the caller moves on (conversation / group info).
 */
export function MemberSheet({ open, onClose, member, ...rest }: MemberSheetProps) {
  const { t } = useI18n()
  return (
    <Sheet open={open && member !== null} onClose={onClose} title={member ? t('chat.group.memberActions', { name: member.displayName }) : ''} hideTitle>
      {member ? <MemberActions key={member.id} member={member} {...rest} /> : null}
    </Sheet>
  )
}

type Busy = 'message' | 'role'

function MemberActions({ member, canChangeRole, canRemove, onMessage, onSetRole, onRemove, errorMessage }: Omit<MemberSheetProps, 'open' | 'onClose' | 'member'> & { member: GroupMember }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const manager = member.memberRole === 'manager'

  const run = async (action: Busy, task: () => Promise<void>) => {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3.5 pb-1">
      <PersonCard profile={member}>
        {manager ? (
          <MiniPill tone="primary" className="self-start">
            <ShieldCheck size={11} aria-hidden="true" className="mr-1 shrink-0" />
            {t('chat.group.manager')}
          </MiniPill>
        ) : null}
      </PersonCard>

      {error ? (
        <p role="alert" className="m-0 text-sm leading-[1.45] font-semibold text-pretty text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button
          icon={MessageCircle}
          fullWidth
          loading={busy === 'message'}
          disabled={busy === 'role'}
          aria-label={t('chat.group.sendMessageTo', { name: member.displayName })}
          onClick={() => void run('message', () => onMessage(member))}
        >
          {t('chat.group.sendMessage')}
        </Button>
        {canChangeRole ? (
          <Button
            variant="secondary"
            icon={manager ? ShieldOff : ShieldCheck}
            fullWidth
            loading={busy === 'role'}
            disabled={busy === 'message'}
            onClick={() => void run('role', () => onSetRole(member, manager ? 'member' : 'manager'))}
          >
            {t(manager ? 'chat.group.removeAdmin' : 'chat.group.makeAdmin')}
          </Button>
        ) : null}
        {canRemove ? (
          <Button variant="dangerGhost" icon={UserMinus} fullWidth disabled={busy !== null} onClick={() => onRemove(member)}>
            {t('chat.group.removeFromGroup')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
