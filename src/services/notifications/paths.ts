/**
 * In-app paths a notification may open. The same rule lives in public/sw-notifications.js (which cannot import this
 * file): keep both in sync. Anything else (external URLs, other routes) is ignored and the app just opens.
 */
export const PERMISSIONS_PATH = '/settings/permissions'

const NOTIFICATION_TARGET = /^\/(?:chat(?:\/[A-Za-z0-9-]+)?|settings\/permissions)$/

export function isNotificationTarget(url: unknown): url is string {
  return typeof url === 'string' && NOTIFICATION_TARGET.test(url)
}
