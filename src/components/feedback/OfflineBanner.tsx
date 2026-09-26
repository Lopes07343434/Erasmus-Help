import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cn } from '@/components/ui/cn'

const BACK_ONLINE_MS = 2500

/**
 * Small glass pill shown while offline (and briefly "back online" afterwards). Sticky at the top of the
 * content column, below the safe-area inset. The live region stays mounted so changes are announced.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnlineStatus()
  const { t } = useI18n()
  const [prevOnline, setPrevOnline] = useState(online)
  const [backOnline, setBackOnline] = useState(false)

  // Adjust state while rendering when connectivity flips (offline → online shows "back online").
  if (online !== prevOnline) {
    setPrevOnline(online)
    setBackOnline(online)
  }

  useEffect(() => {
    if (!backOnline) return
    const id = setTimeout(() => setBackOnline(false), BACK_ONLINE_MS)
    return () => clearTimeout(id)
  }, [backOnline])

  const visible = !online || backOnline
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none sticky top-[calc(env(safe-area-inset-top)_+_8px)] z-(--z-floating) flex justify-center',
        visible && 'mb-3',
        className,
      )}
    >
      {!online ? (
        <span className="glass pointer-events-auto flex h-10 max-w-full animate-eh-fade items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-text shadow-glass">
          <WifiOff size={16} aria-hidden="true" className="shrink-0 text-danger" />
          <span className="truncate">{t('common.status.offline')}</span>
          <span className="sr-only">{t('common.status.offlineBody')}</span>
        </span>
      ) : backOnline ? (
        <span className="glass pointer-events-auto flex h-10 max-w-full animate-eh-fade items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-text shadow-glass">
          <Wifi size={16} aria-hidden="true" className="shrink-0 text-success" />
          <span className="truncate">{t('common.status.backOnline')}</span>
        </span>
      ) : null}
    </div>
  )
}
