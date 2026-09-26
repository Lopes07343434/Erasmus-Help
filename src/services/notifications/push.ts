import { env } from '@/config/env'
import { AppError, toAppError } from '../errors'
import { requestJson } from '../http'
import { getNotificationPermission, isPushSupported } from './permission'

/**
 * Web Push (client side). Delivery needs two things that do not exist yet:
 *   - VITE_VAPID_PUBLIC_KEY (public by design; the private key lives only in the backend)
 *   - a backend at VITE_API_BASE_URL implementing PUSH_ENDPOINTS
 * Until both are set, subscribeToPush() throws AppError('not-configured') — never a fake success.
 *
 * Proposed backend contract (JSON, HTTPS):
 *   POST {apiBaseUrl}/push/subscribe    { subscription: PushSubscriptionJSON, locale?: string } → 2xx
 *   POST {apiBaseUrl}/push/unsubscribe  { endpoint: string } → 2xx
 * The backend must drop subscriptions the push service answers with 404/410.
 */
export const PUSH_ENDPOINTS = { subscribe: '/push/subscribe', unsubscribe: '/push/unsubscribe' } as const

/** `navigator.serviceWorker.ready` never settles when no SW is registered (e.g. `npm run dev`). */
const SW_READY_TIMEOUT_MS = 10_000

export interface PushRequestOptions {
  /** App language, so the backend can localise notification text (pt-PT / en / pl). */
  locale?: string
  signal?: AbortSignal
}

/** Decodes a base64url VAPID key into the bytes PushManager expects. Throws on invalid base64. */
export function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** True when the build has what push needs (VAPID key + backend). Use it to hide/disable push UI. */
export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.apiBaseUrl)
}

function readConfig(): { applicationServerKey: Uint8Array<ArrayBuffer>; apiBaseUrl: string } {
  const { vapidPublicKey, apiBaseUrl } = env
  if (!vapidPublicKey || !apiBaseUrl) throw new AppError('not-configured')
  let key: Uint8Array<ArrayBuffer>
  try {
    key = urlBase64ToUint8Array(vapidPublicKey.trim())
  } catch (err) {
    throw new AppError('not-configured', err)
  }
  // A VAPID public key is an uncompressed P-256 point: 65 bytes starting with 0x04.
  if (key.length !== 65 || key[0] !== 0x04) throw new AppError('not-configured')
  return { applicationServerKey: key, apiBaseUrl }
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
 * Subscribes this device and registers the subscription with the backend.
 * Call only after requestNotificationPermission() resolved 'granted' (from a user gesture).
 *
 * @throws AppError 'not-configured' (no VAPID key / backend), 'not-supported', 'permission-denied'
 *   (permission not granted), 'unavailable' (no service worker / push service error) or http errors.
 */
export async function subscribeToPush(options: PushRequestOptions = {}): Promise<PushSubscription> {
  const { applicationServerKey, apiBaseUrl } = readConfig()
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

  await requestJson(`${apiBaseUrl}${PUSH_ENDPOINTS.subscribe}`, {
    method: 'POST',
    body: { subscription: subscription.toJSON(), locale: options.locale },
    signal: options.signal,
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
 * Removes this device's subscription. Works even without a backend configured (the local subscription
 * is always removed); the backend is told on a best-effort basis — it also prunes endpoints that the
 * push service reports as gone. Resolves false when there was nothing to unsubscribe.
 */
export async function unsubscribeFromPush(options: Pick<PushRequestOptions, 'signal'> = {}): Promise<boolean> {
  let subscription: PushSubscription | null
  try {
    subscription = await getPushSubscription()
    if (!subscription) return false
    await subscription.unsubscribe()
  } catch (err) {
    throw toPushError(err)
  }
  if (env.apiBaseUrl) {
    await requestJson(`${env.apiBaseUrl}${PUSH_ENDPOINTS.unsubscribe}`, {
      method: 'POST',
      body: { endpoint: subscription.endpoint },
      signal: options.signal,
    }).catch(() => undefined)
  }
  return true
}
