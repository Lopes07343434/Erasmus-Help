import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button, IconButton, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
// Via the index on purpose: it also loads useInstallPrompt, which starts capturing `beforeinstallprompt`.
import { useServiceWorker } from '@/pwa'

/**
 * Global PWA notices, mounted once in AppLayout (inside its ToastProvider):
 *  - a new version is waiting → floating glass card above the nav with "Atualizar" and close;
 *  - the app shell became available offline (first install) → one toast.
 * Rendered in place (not portalled) so it inherits the layout variables --eh-toast-bottom / --eh-sidebar-w.
 */
export default function PwaNotices() {
  const { t } = useI18n()
  const toast = useToast()
  const { needRefresh, offlineReady, update, dismiss } = useServiceWorker()
  const [updating, setUpdating] = useState(false)
  const offlineAnnounced = useRef(false)
  const titleId = useId()

  useEffect(() => {
    if (!offlineReady || offlineAnnounced.current) return
    offlineAnnounced.current = true
    toast.show(t('pwa.offlineReady.title'), { duration: 3500 })
  }, [offlineReady, toast, t])

  const onUpdate = () => {
    setUpdating(true)
    // The page reloads once the new service worker takes control.
    update().catch(() => setUpdating(false))
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-0 bottom-(--eh-toast-bottom,calc(24px_+_env(safe-area-inset-bottom))) left-(--eh-sidebar-w,0px) z-(--z-toast) flex justify-center px-4"
    >
      {needRefresh ? (
        <section
          aria-labelledby={titleId}
          className="glass pointer-events-auto flex w-full max-w-[420px] animate-eh-fade items-center gap-3 rounded-card py-2.5 pr-1.5 pl-4 shadow-glass"
        >
          <RefreshCw size={19} aria-hidden="true" className="shrink-0 text-primary" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
            <h2 id={titleId} className="m-0 text-sm leading-[1.3] font-semibold text-text">
              {t('pwa.update.title')}
            </h2>
            <p className="m-0 text-[13px] leading-[1.35] text-text3">{t('pwa.update.body')}</p>
          </div>
          <Button size="sm" loading={updating} onClick={onUpdate}>
            {t('pwa.update.action')}
          </Button>
          <IconButton variant="plain" icon={X} aria-label={t('pwa.update.later')} onClick={dismiss} disabled={updating} />
        </section>
      ) : null}
    </div>
  )
}
