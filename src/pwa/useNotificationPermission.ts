import { useCallback, useEffect, useState } from 'react'
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/services/notifications'

export interface UseNotificationPermissionResult {
  /** Real browser permission ('unsupported' when the Notification API is missing). */
  readonly permission: NotificationPermissionState
  /** True while the browser prompt is open. */
  readonly requesting: boolean
  /** Opens the real browser prompt. Call it directly from a click/tap handler. */
  request: () => Promise<NotificationPermissionState>
}

/**
 * Tracks the notification permission, including changes the user makes later in the browser/OS
 * settings (Permissions API `change` where supported, otherwise re-read when the app regains focus).
 */
export function useNotificationPermission(): UseNotificationPermissionResult {
  const [permission, setPermission] = useState<NotificationPermissionState>(getNotificationPermission)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    const refresh = () => setPermission(getNotificationPermission())
    let status: PermissionStatus | null = null
    let cancelled = false
    if (typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((result) => {
          if (cancelled) return
          status = result
          result.addEventListener('change', refresh)
        })
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      status?.removeEventListener('change', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const request = useCallback(async () => {
    setRequesting(true)
    try {
      const result = await requestNotificationPermission()
      setPermission(result)
      return result
    } finally {
      setRequesting(false)
    }
  }, [])

  return { permission, requesting, request }
}
