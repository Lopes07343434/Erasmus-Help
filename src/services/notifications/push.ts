import { env } from '@/config/env'
import type { UiLocale } from '@/i18n/languages'
import { currentPlatform } from '@/utils/platform'
import { AppError, toAppError } from '../errors'
import { getNotificationPermission, isPushSupported } from './permission'
import { registerPushSubscription, unregisterPushSubscription } from './registry'

/**
 * Web Push (client side). A device subscribes through the browser's PushManager with the public VAPID key and registers
 * the subscription in Supabase (`push_subscriptions`, see ./registry.ts). The Edge Function `send-push` then delivers
 * real notifications; the service worker (public/sw-notifications.js) shows them, in the user's app language.
 * Needs VITE_VAPID_PUBLIC_KEY + the Supabase project; without them subscribeToPush() throws AppError('not-configured')
 * — never a fake success.
 */

/** `navigator.serviceWorker.ready` never settles when no SW is registered (e.g. `npm run dev`). */
const SW_READY_TIMEOUT_MS = 10_000

export interface PushRequestOptions {
  /** App language: the language of the notifications sent to this device. */
  locale?: UiLocale
}

/** Decodes a base64url VAPID key into the bytes PushManager expects. Throws on invalid base64. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** True when the build has what push needs (VAPID key + Supabase project). Use it to hide/disable push UI. */
export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.supabaseUrl && env.supabasePublishableKey)
}

function readConfig(): { applicationServerKey: Uint8Array<ArrayBuffer> } {
  const { vapidPublicKey } = env
  if (!vapidPublicKey || !env.supabaseUrl || !env.supabasePublishableKey) throw new AppError('not-configured')
  let key: Uint8Array<ArrayBuffer>
  try {
    key = urlBase64ToUint8Array(vapidPublicKey.trim())
  } catch (err) {
    throw new AppError('not-configured', err)
  }
  // A VAPID public key is an uncompressed P-256 point: 65 bytes starting with 0x04.
  if (key.length !== 65 || key[0] !== 0x04) throw new AppError('not-configured')
  return { applicationServerKey: key }
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError('unavailable')), SW_READY_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current || current.byteLength !== expected.length) return false
  const bytes = new Uint8Array(current)
  return bytes.every((byte, i) => byte === expected[i])
}

function toPushError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return new AppError('permission-denied', err)
    if (err.name === 'NotSupportedError') return new AppError('not-supported', err)
    // Push service unreachable / no active worker: not a user abort.
    if (err.name === 'AbortError' || err.name === 'InvalidStateError') return new AppError('unavailable', err)
  }
  return toAppError(err)
}

/**
 * Subscribes this device and registers the subscription in Supabase (idempotent: safe to call on every start).
 * Call only after requestNotificationPermission() resolved 'granted'.
 *
 * @throws AppError 'not-configured' (no VAPID key / Supabase), 'not-supported', 'permission-denied'
 *   (permission not granted), 'unavailable' / 'offline' (no service worker, push service or chat session yet).
 */
export async function subscribeToPush(options: PushRequestOptions = {}): Promise<PushSubscription> {
  const { applicationServerKey } = readConfig()
  if (!isPushSupported()) throw new AppError('not-supported')
  if (getNotificationPermission() !== 'granted') throw new AppError('permission-denied')

  let subscription: PushSubscription
  try {
    const registration = await readyRegistration()
    const existing = await registration.pushManager.getSubscription()
    if (existing && sameKey(existing.options.applicationServerKey, applicationServerKey)) {
      subscription = existing
    } else {
      // Subscribed with an old (rotated) VAPID key: that subscription can no longer receive our pushes.
      await existing?.unsubscribe()
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    }
  } catch (err) {
    throw toPushError(err)
  }

  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) throw new AppError('unavailable')
  await registerPushSubscription({
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    platform: currentPlatform(),
    locale: options.locale,
  })
  return subscription
}

/** Current push subscription of this device, or null (also when push is unsupported). */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/**
 * Removes this device's subscription. The local subscription is always removed; the server is told on a best-effort
 * basis (it also prunes endpoints that the push service reports as gone). Resolves false when there was nothing to
 * unsubscribe.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  let subscription: PushSubscription | null
  try {
    subscription = await getPushSubscription()
    if (!subscription) return false
    await subscription.unsubscribe()
  } catch (err) {
    throw toPushError(err)
  }
  await unregisterPushSubscription(subscription.endpoint).catch(() => undefined)
  return true
}
