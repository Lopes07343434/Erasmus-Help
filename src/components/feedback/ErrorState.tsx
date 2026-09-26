import type { ReactNode } from 'react'
import { CircleAlert, RotateCw, WifiOff, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { toAppError, type AppErrorCode } from '@/services/errors'
import { Button } from '@/components/ui/Button'
import { errorI18nKey } from './errorI18nKey'
import { StateView } from './StateView'

interface ErrorStateProps {
  /** Error code; ignored when `error` is given. Default 'unknown'. */
  code?: AppErrorCode
  /** Any thrown value; mapped with toAppError (never shows its message). */
  error?: unknown
  /** Overrides for the localized errors.<key>.title / .body. */
  title?: ReactNode
  body?: ReactNode
  icon?: LucideIcon
  /** Shows a secondary "Tentar novamente" button. */
  onRetry?: () => void
  retryLabel?: string
  /** Extra actions next to retry. */
  actions?: ReactNode
  className?: string
}

/** Localized error block (danger tile + title/body from `errors.<key>` + retry). */
export function ErrorState({ code, error, title, body, icon, onRetry, retryLabel, actions, className }: ErrorStateProps) {
  const { t } = useI18n()
  const resolved: AppErrorCode = error !== undefined ? toAppError(error).code : (code ?? 'unknown')
  const key = errorI18nKey(resolved)
  return (
    <StateView
      icon={icon ?? (resolved === 'offline' ? WifiOff : CircleAlert)}
      tone="danger"
      textRole="alert"
      title={title ?? t(`${key}.title`)}
      body={body ?? t(`${key}.body`)}
      className={className}
      action={
        onRetry || actions ? (
          <>
            {onRetry ? (
              <Button variant="secondary" size="sm" icon={RotateCw} onClick={onRetry}>
                {retryLabel ?? t('common.actions.retry')}
              </Button>
            ) : null}
            {actions}
          </>
        ) : null
      }
    />
  )
}
