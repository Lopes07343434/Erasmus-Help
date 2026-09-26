import { useId, useState, type FormEvent } from 'react'
import { Link2 } from 'lucide-react'
import { Button, GlassCard, TextField, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { parsePublicId } from '@/services/chat/types'
import { chatErrorMessage } from '@/pages/chat/chatErrors'

interface AssignMonitorCardProps {
  onAssign: (studentPublicId: number, monitorPublicId: number | null) => Promise<void>
}

/** "Associar aluno a monitor": both public IDs → setStudentMonitor. */
export function AssignMonitorCard({ onAssign }: AssignMonitorCardProps) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const titleId = useId()
  const [student, setStudent] = useState('')
  const [monitor, setMonitor] = useState('')
  const [studentError, setStudentError] = useState<string | null>(null)
  const [monitorError, setMonitorError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const studentId = parsePublicId(student)
    const monitorId = parsePublicId(monitor)
    setStudentError(studentId === null ? t('chat.lookup.invalid') : null)
    setMonitorError(monitorId === null ? t('chat.lookup.invalid') : null)
    setError(null)
    if (studentId === null || monitorId === null) return
    setBusy(true)
    try {
      await onAssign(studentId, monitorId)
      toast.show(t('chat.admin.saved'))
      setStudent('')
      setMonitor('')
    } catch (err) {
      setError(chatErrorMessage(err, i18n, { notFound: 'person' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard as="section" aria-labelledby={titleId} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {t('chat.admin.assignTitle')}
        </h2>
        <p className="m-0 text-[13px] leading-[1.4] text-pretty text-text3">{t('chat.admin.assignBody')}</p>
      </div>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('chat.admin.studentIdLabel')}
            value={student}
            onChange={(e) => {
              setStudent(e.target.value)
              setStudentError(null)
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            error={studentError}
          />
          <TextField
            label={t('chat.admin.monitorIdLabel')}
            value={monitor}
            onChange={(e) => {
              setMonitor(e.target.value)
              setMonitorError(null)
            }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            error={monitorError}
          />
        </div>
        {error ? (
          <p role="alert" className="m-0 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" size="sm" icon={Link2} loading={busy} className="self-start">
          {t('chat.admin.assign')}
        </Button>
      </form>
    </GlassCard>
  )
}
