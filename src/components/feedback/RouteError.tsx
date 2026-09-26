import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { toAppError, type AppErrorCode } from '@/services/errors'
import { AppBackground } from '@/components/ui/AppBackground'
import { Button } from '@/components/ui/Button'
import { ErrorState } from './ErrorState'

/** Route errorElement: full-screen localized error with a reload button (covers failed lazy chunks too). */
export function RouteError() {
  const error = useRouteError()
  const { t } = useI18n()

  useEffect(() => {
    if (import.meta.env.DEV) console.error(error)
  }, [error])

  const code: AppErrorCode = isRouteErrorResponse(error) && error.status === 404 ? 'not-found' : toAppError(error).code

  return (
    <div className="relative min-h-dvh text-text">
      <AppBackground />
      <main className="relative z-(--z-content) grid min-h-dvh place-items-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <ErrorState
          code={code}
          actions={
            <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => window.location.reload()}>
              {t('common.actions.reload')}
            </Button>
          }
        />
      </main>
    </div>
  )
}
