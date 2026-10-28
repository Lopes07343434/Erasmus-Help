import { useEffect, useId, useRef, useState } from 'react'
import { BellRing, RefreshCw, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button, IconButton, useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
// Via the index on purpose: it also loads useInstallPrompt, which starts capturing `beforeinstallprompt`.
import { useInstallPrompt, useNotificationPermission, useServiceWorker } from '@/pwa'
import { isPushConfigured } from '@/services/notifications'
import { PERMISSIONS_PATH } from '@/services/notifications/paths'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Global PWA notices, mounted once in AppLayout (inside its ToastProvider):
 *  - a new version is waiting → floating glass card above the nav with "Atualizar" and close;
 *  - the app shell became available offline (first install) → one toast;
 *  - Android devices that have not been asked about notifications yet → a one-time card announcing push notifications,
 *    which opens the permissions screen (the same screen the push announcement notification opens). Only when the build
 *    can really deliver push, and never again once opened or closed.
 * Rendered in place (not portalled) so it inherits the layout variables --eh-toast-bottom / --eh-sidebar-w.
 */
export default function PwaNotices() {
  const { t } = useI18n()
  const toast = useToast()
  const { needRefresh, offlineReady, update, dismiss } = useServiceWorker()
  const navigate = useNavigate()
  const { platform } = useInstallPrompt()
  const { permission } = useNotificationPermission()
  const announced = useSettingsStore((s) => s.pushAnnouncementSeen)
  const markAnnounced = useSettingsStore((s) => s.markPushAnnouncementSeen)
  const [updating, setUpdating] = useState(false)
  const offlineAnnounced = useRef(false)
  const titleId = useId()
  const announceId = useId()
  const showAnnouncement = !needRefresh && !announced && platform === 'android' && permission === 'default' && isPushConfigured()

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
      {showAnnouncement ? (
        <section
          aria-labelledby={announceId}
          className="glass pointer-events-auto flex w-full max-w-[420px] animate-eh-fade flex-col gap-1 rounded-card py-2 pr-1.5 pl-4 shadow-glass"
        >
          <div className="flex items-start gap-3">
            <BellRing size={19} aria-hidden="true" className="mt-3.5 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5">
              <h2 id={announceId} className="m-0 text-sm leading-[1.3] font-semibold text-text">
                {t('pwa.push.announcement.title')}
              </h2>
              <p className="m-0 text-[13px] leading-[1.35] text-text3">{t('pwa.push.announcement.body')}</p>
            </div>
            <IconButton variant="plain" icon={X} aria-label={t('pwa.push.announcement.dismiss')} onClick={markAnnounced} />
          </div>
          <div className="pr-2.5 pb-1">
            <Button
              size="sm"
              fullWidth
              onClick={() => {
                markAnnounced()
                void navigate(PERMISSIONS_PATH)
              }}
            >
              {t('pwa.push.announcement.action')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
