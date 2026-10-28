import { useEffect } from 'react'
import { useChatSession } from '@/hooks/chat'
import { useI18n } from '@/i18n/I18nProvider'
import { useNotificationPermission } from '@/pwa/useNotificationPermission'
import { toAppError } from '@/services/errors'
import { isPushConfigured, subscribeToPush } from '@/services/notifications'
import { usePushSyncStore } from '@/services/notifications/syncState'
import { useSettingsStore } from '@/stores/settingsStore'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * Keeps this device registered for push, app-wide (mounted once by AppLayout): whenever the user wants notifications
 * (Definições), the browser permission is granted and the chat account exists, the subscription is created / refreshed
 * on the server. That covers turning notifications on, devices that already had the permission before push existed,
 * a push service that rotated the subscription, and a language change (the notification language follows the profile).
 * Nothing runs without VITE_VAPID_PUBLIC_KEY + Supabase, and never without the real permission.
 */
export function usePushSync(): void {
  const { locale } = useI18n()
  const enabled = useSettingsStore((s) => s.notificationsEnabled)
  const { permission } = useNotificationPermission()
  const sessionStatus = useChatSession().status
  const online = useOnlineStatus()
  const attempt = usePushSyncStore((s) => s.attempt)
  const setStatus = usePushSyncStore((s) => s.setStatus)

  useEffect(() => {
    if (!isPushConfigured() || !enabled || permission !== 'granted' || sessionStatus !== 'ready' || !online) return
    let cancelled = false
    setStatus('syncing')
    subscribeToPush({ locale }).then(
      () => {
        if (!cancelled) setStatus('registered')
      },
      (err: unknown) => {
        if (!cancelled) setStatus(toAppError(err).code === 'not-configured' ? 'idle' : 'failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, permission, sessionStatus, online, locale, attempt, setStatus])
}
