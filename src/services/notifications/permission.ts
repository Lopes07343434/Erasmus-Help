/**
 * Real browser/OS notification permission. Nothing here simulates a result: every value comes from
 * the Notification API, and 'granted' is only ever returned when the browser says so.
 *
 * iOS/iPadOS expose the Notification API only inside the installed home-screen app (iOS 16.4+),
 * so a Safari tab reports 'unsupported'.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function isNotificationSupported(): boolean {
  return typeof globalThis.Notification === 'function'
}

/** Web Push needs notifications + a service worker + PushManager. */
export function isPushSupported(): boolean {
  return (
    isNotificationSupported() &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in globalThis
  )
}

function normalize(value: unknown): Exclude<NotificationPermissionState, 'unsupported'> {
  return value === 'granted' || value === 'denied' ? value : 'default'
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return normalize(Notification.permission)
}

/**
 * Shows the browser's permission prompt and resolves with the user's real answer.
 * MUST be called from a user gesture (click/tap handler), or browsers ignore/auto-deny it.
 *
 * - 'denied' is final: browsers never prompt again; only the user can change it in the
 *   browser/OS settings (show the pwa.notifications.reenable instructions).
 * - 'default' after the call means the user dismissed the prompt without choosing.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermission()
  if (current !== 'default') return current
  try {
    return normalize(await Notification.requestPermission())
  } catch {
    // Some engines throw outside a user gesture: report the real (unchanged) state.
    return getNotificationPermission()
  }
}
