import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { isPushConfigured, subscribeToPush, unsubscribeFromPush, urlBase64ToUint8Array } from './push'

const mockEnv = vi.hoisted(() => ({
  vapidPublicKey: null as string | null,
  apiBaseUrl: null as string | null,
}))
vi.mock('@/config/env', () => ({ env: mockEnv }))

/** A syntactically valid VAPID public key: 65 bytes, uncompressed point prefix 0x04, base64url. */
const VALID_KEY_BYTES = [4, ...Array.from({ length: 64 }, (_, i) => (i * 7 + 3) % 256)]
const VALID_KEY = btoa(String.fromCharCode(...VALID_KEY_BYTES))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

async function expectAppError(promise: Promise<unknown>, code: AppError['code']) {
  const err: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
}

function stubPushPlatform(permission: NotificationPermission) {
  class MockNotification {
    static permission: NotificationPermission = permission
    static requestPermission = vi.fn(async () => permission)
  }
  const subscription = {
    endpoint: 'https://push.example/abc',
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn(async () => true),
  }
  const pushManager = {
    getSubscription: vi.fn(async (): Promise<typeof subscription | null> => null),
    subscribe: vi.fn(async () => subscription),
  }
  const registration = { pushManager }
  vi.stubGlobal('Notification', MockNotification)
  vi.stubGlobal('PushManager', class {})
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve(registration), getRegistration: async () => registration },
  })
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
  vi.stubGlobal('fetch', fetchMock)
  return { pushManager, subscription, fetchMock }
}

beforeEach(() => {
  mockEnv.vapidPublicKey = null
  mockEnv.apiBaseUrl = null
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('push configuration', () => {
  it('decodes base64url VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array(VALID_KEY))).toEqual(VALID_KEY_BYTES)
  })

  it('throws not-configured when the VAPID key is missing', async () => {
    mockEnv.apiBaseUrl = 'https://api.example'
    expect(isPushConfigured()).toBe(false)
    await expectAppError(subscribeToPush(), 'not-configured')
  })

  it('throws not-configured when the backend is missing', async () => {
    mockEnv.vapidPublicKey = VALID_KEY
    expect(isPushConfigured()).toBe(false)
    await expectAppError(subscribeToPush(), 'not-configured')
  })

  it('throws not-configured when the VAPID key is malformed', async () => {
    mockEnv.vapidPublicKey = 'not-a-real-key'
    mockEnv.apiBaseUrl = 'https://api.example'
    await expectAppError(subscribeToPush(), 'not-configured')
  })
})

describe('push subscription', () => {
  beforeEach(() => {
    mockEnv.vapidPublicKey = VALID_KEY
    mockEnv.apiBaseUrl = 'https://api.example'
  })

  it('throws not-supported when the browser has no Push API', async () => {
    expect(isPushConfigured()).toBe(true)
    await expectAppError(subscribeToPush(), 'not-supported')
  })

  it('throws permission-denied unless notifications are granted', async () => {
    const { pushManager } = stubPushPlatform('denied')
    await expectAppError(subscribeToPush(), 'permission-denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('subscribes with the VAPID key and registers the subscription with the backend', async () => {
    const { pushManager, fetchMock } = stubPushPlatform('granted')
    await subscribeToPush({ locale: 'pt-PT' })
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(VALID_KEY_BYTES),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/push/subscribe')
    expect(JSON.parse(String(init.body))).toMatchObject({ locale: 'pt-PT', subscription: { endpoint: 'https://push.example/abc' } })
  })

  it('unsubscribes locally and reports false when there is nothing to remove', async () => {
    const { pushManager, subscription } = stubPushPlatform('granted')
    await expect(unsubscribeFromPush()).resolves.toBe(false)
    pushManager.getSubscription.mockResolvedValueOnce(subscription)
    await expect(unsubscribeFromPush()).resolves.toBe(true)
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
