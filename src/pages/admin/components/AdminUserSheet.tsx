import { useId, useState, type FormEvent } from 'react'
import { CircleAlert, GraduationCap, Save, ShieldCheck, UserMinus } from 'lucide-react'
import { Button, ListGroup, ListSectionTitle, ListSwitchRow, Sheet, TextField, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import type { AdminUserRow, AdminUsersState } from '@/services/chat/api'
import { parsePublicId } from '@/services/chat/types'
import { chatErrorMessage } from '@/pages/chat/chatErrors'
import { publicIdLabel } from '@/pages/chat/chatFormat'
import { PersonCard } from '@/pages/chat/components/IdLookup'

type Action = 'verify' | 'role' | 'monitor' | 'removeMonitor'

interface AdminUserSheetProps {
  /** Open while a user is selected. */
  user: AdminUserRow | null
  onClose: () => void
  admin: Pick<AdminUsersState, 'verifyMonitor' | 'setRole' | 'setStudentMonitor'>
}

/** Actions on one user: monitor verification, role student ↔ monitor, a student's monitor. */
export function AdminUserSheet({ user, onClose, admin }: AdminUserSheetProps) {
  return (
    <Sheet open={user !== null} onClose={onClose} title={user?.displayName ?? ''}>
      {user ? <AdminUserActions key={user.id} user={user} admin={admin} /> : null}
    </Sheet>
  )
}

function AdminUserActions({ user, admin }: { user: AdminUserRow; admin: AdminUserSheetProps['admin'] }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const monitorTitleId = useId()
  const [busy, setBusy] = useState<Action | null>(null)
  const [monitorInput, setMonitorInput] = useState('')
  const [monitorError, setMonitorError] = useState<string | null>(null)

  const run = async (action: Action, task: () => Promise<void>) => {
    if (busy) return false
    setBusy(action)
    try {
      await task()
      toast.show(t('chat.admin.saved'))
      return true
    } catch (err) {
      const message = chatErrorMessage(err, i18n, { notFound: action === 'monitor' ? 'person' : 'generic' })
      if (action === 'monitor') setMonitorError(message)
      else toast.show(message, { icon: CircleAlert, duration: 3200 })
      return false
    } finally {
      setBusy(null)
    }
  }

  const saveMonitor = async (e: FormEvent) => {
    e.preventDefault()
    const monitorId = parsePublicId(monitorInput)
    if (monitorId === null) return setMonitorError(t('chat.lookup.invalid'))
    if (await run('monitor', () => admin.setStudentMonitor(user.publicId, monitorId))) setMonitorInput('')
  }

  if (user.role === 'admin') {
    return (
      <div className="flex flex-col gap-3.5 pb-1">
        <PersonCard profile={user} />
        <p className="m-0 text-sm leading-[1.5] text-text2">{t('chat.admin.adminNoActions')}</p>
      </div>
    )
  }

  const monitor = user.role === 'monitor'
  return (
    <div className="flex flex-col gap-4 pb-1">
      <PersonCard profile={user} />

      {monitor ? (
        <ListGroup>
          <ListSwitchRow
            icon={ShieldCheck}
            label={t('chat.admin.verified')}
            description={t('chat.admin.verifiedHint')}
            checked={user.monitorStatus === 'verified'}
            disabled={busy !== null}
            onCheckedChange={(value) => void run('verify', () => admin.verifyMonitor(user.id, value))}
          />
        </ListGroup>
      ) : (
        <section aria-labelledby={monitorTitleId} className="flex flex-col gap-2.5">
          <ListSectionTitle id={monitorTitleId}>{t('chat.admin.studentMonitor')}</ListSectionTitle>
          <p className="m-0 mx-1 text-sm text-text2">
            {user.monitor ? `${user.monitor.displayName} · ${publicIdLabel(user.monitor.publicId)}` : t('chat.admin.noMonitor')}
          </p>
          <form noValidate onSubmit={(e) => void saveMonitor(e)} className="flex flex-col gap-2.5">
            <TextField
              label={t('chat.admin.monitorIdLabel')}
              value={monitorInput}
              onChange={(e) => {
                setMonitorInput(e.target.value)
                setMonitorError(null)
              }}
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              description={t('chat.lookup.idHint')}
              error={monitorError}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" size="sm" icon={Save} loading={busy === 'monitor'} disabled={busy !== null && busy !== 'monitor'}>
                {t('chat.admin.setMonitor')}
              </Button>
              {user.monitor ? (
                <Button
                  variant="dangerGhost"
                  size="sm"
                  icon={UserMinus}
                  loading={busy === 'removeMonitor'}
                  disabled={busy !== null && busy !== 'removeMonitor'}
                  onClick={() => void run('removeMonitor', () => admin.setStudentMonitor(user.publicId, null))}
                >
                  {t('chat.admin.removeMonitor')}
                </Button>
              ) : null}
            </div>
          </form>
        </section>
      )}

      <Button
        variant="secondary"
        icon={GraduationCap}
        fullWidth
        loading={busy === 'role'}
        disabled={busy !== null && busy !== 'role'}
        onClick={() => void run('role', () => admin.setRole(user.id, monitor ? 'student' : 'monitor'))}
      >
        {t(monitor ? 'chat.admin.makeStudent' : 'chat.admin.makeMonitor')}
      </Button>
    </div>
  )
}
