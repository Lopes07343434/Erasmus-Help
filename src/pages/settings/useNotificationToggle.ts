import { BellOff, CircleAlert } from 'lucide-react'
import { useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useNotificationPermission } from '@/pwa/useNotificationPermission'
import { toAppError } from '@/services/errors'
import { isPushConfigured, subscribeToPush, unsubscribeFromPush } from '@/services/notifications'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Notifications switch. Turning it on asks the browser for real (must run from the click) and only stays on
 * when the permission is granted; push delivery is subscribed when the build has it configured.
 */
export function useNotificationToggle() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const { permission, requesting, request } = useNotificationPermission()
  const enabled = useSettingsStore((s) => s.notificationsEnabled)
  const setEnabled = useSettingsStore((s) => s.setNotificationsEnabled)

  const turnOn = () => {
    void request().then((result) => {
      if (result === 'granted') {
        setEnabled(true)
        toast.show(t('settings.notifications.enabledToast'))
        if (isPushConfigured()) {
          subscribeToPush({ locale }).catch((err: unknown) => {
            // Without a VAPID key/backend the local preference stays on; delivery starts once configured.
            if (toAppError(err).code !== 'not-configured') toast.show(t('settings.notifications.pushError'), { icon: CircleAlert, duration: 3500 })
          })
        }
      } else if (result === 'denied') {
        setEnabled(false)
        toast.show(t('settings.notifications.deniedToast'), { icon: BellOff, duration: 3500 })
      } else if (result === 'default') {
        toast.show(t('settings.notifications.dismissedToast'), { icon: null })
      }
    })
  }

  const turnOff = () => {
    setEnabled(false)
    unsubscribeFromPush().catch(() => undefined)
  }

  return {
    permission,
    requesting,
    /** On only when the user wants it AND the browser currently allows it. */
    checked: enabled && permission === 'granted',
    pushConfigured: isPushConfigured(),
    toggle: (next: boolean) => (next ? turnOn() : turnOff()),
  }
}
