import { useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button, Sheet } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'

interface ConfirmSheetProps {
  open: boolean
  onClose: () => void
  title: string
  body: ReactNode
  /** Extra danger line ("Não é possível desfazer."). */
  warning?: string
  confirmLabel: string
  confirmIcon?: LucideIcon
  tone?: 'danger' | 'primary'
  /** Runs the action; the sheet shows the spinner meanwhile. Resolve → the caller closes/navigates. */
  onConfirm: () => Promise<void>
  /** Maps a failure to the message shown in the sheet. */
  errorMessage: (err: unknown) => string
}

/** Confirmation bottom sheet (like "Apagar dados"): body, optional warning, confirm + cancel, inline error on failure. */
export function ConfirmSheet({ open, onClose, title, body, warning, confirmLabel, confirmIcon, tone = 'danger', onConfirm, errorMessage }: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ConfirmContent
        onClose={onClose}
        body={body}
        warning={warning}
        confirmLabel={confirmLabel}
        confirmIcon={confirmIcon}
        tone={tone}
        onConfirm={onConfirm}
        errorMessage={errorMessage}
      />
    </Sheet>
  )
}

function ConfirmContent({
  onClose,
  body,
  warning,
  confirmLabel,
  confirmIcon,
  tone,
  onConfirm,
  errorMessage,
}: Omit<ConfirmSheetProps, 'open' | 'title'>) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="m-0 text-[15px] leading-[1.5] text-pretty text-text2">{body}</div>
      {warning ? <p className="m-0 text-sm leading-[1.5] font-semibold text-pretty text-danger">{warning}</p> : null}
      {error ? (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2.5 pt-1 pb-1">
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} icon={confirmIcon} fullWidth loading={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" fullWidth disabled={busy} onClick={onClose}>
          {t('common.actions.cancel')}
        </Button>
      </div>
    </>
  )
}
