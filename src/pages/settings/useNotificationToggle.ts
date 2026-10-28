import { BellOff } from 'lucide-react'
import { useToast } from '@/components/ui'
import { useI18n } from '@/i18n/I18nProvider'
import { useNotificationPermission } from '@/pwa/useNotificationPermission'
import { isPushConfigured, unsubscribeFromPush } from '@/services/notifications'
import { usePushSyncStore } from '@/services/notifications/syncState'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Notifications switch. Turning it on asks the browser for real (must run from the click) and only stays on
 * when the permission is granted; usePushSync (AppLayout) then registers the device for push delivery.
 */
export function useNotificationToggle() {
  const { t } = useI18n()
  const toast = useToast()
  const { permission, requesting, request } = useNotificationPermission()
  const enabled = useSettingsStore((s) => s.notificationsEnabled)
  const setEnabled = useSettingsStore((s) => s.setNotificationsEnabled)

  const turnOn = () => {
    void request().then((result) => {
      if (result === 'granted') {
        setEnabled(true)
        toast.show(t('settings.notifications.enabledToast'))
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
    usePushSyncStore.getState().setStatus('idle')
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
