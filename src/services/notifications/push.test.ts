import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { isPushConfigured, subscribeToPush, unsubscribeFromPush, urlBase64ToUint8Array } from './push'
import { registerPushSubscription, unregisterPushSubscription } from './registry'

const mockEnv = vi.hoisted(() => ({
  vapidPublicKey: null as string | null,
  supabaseUrl: null as string | null,
  supabasePublishableKey: null as string | null,
}))
vi.mock('@/config/env', () => ({ env: mockEnv }))
vi.mock('./registry', () => ({
  registerPushSubscription: vi.fn(async () => undefined),
  unregisterPushSubscription: vi.fn(async () => undefined),
}))

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
  return { pushManager, subscription }
}

const configureSupabase = () => {
  mockEnv.supabaseUrl = 'https://project.supabase.co'
  mockEnv.supabasePublishableKey = 'sb_publishable_test'
}

beforeEach(() => {
  mockEnv.vapidPublicKey = null
  mockEnv.supabaseUrl = null
  mockEnv.supabasePublishableKey = null
  vi.mocked(registerPushSubscription).mockClear()
  vi.mocked(unregisterPushSubscription).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('push configuration', () => {
  it('decodes base64url VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array(VALID_KEY))).toEqual(VALID_KEY_BYTES)
  })

  it('throws not-configured when the VAPID key is missing', async () => {
    configureSupabase()
    expect(isPushConfigured()).toBe(false)
    await expectAppError(subscribeToPush(), 'not-configured')
  })

  it('throws not-configured when Supabase is missing', async () => {
    mockEnv.vapidPublicKey = VALID_KEY
    expect(isPushConfigured()).toBe(false)
    await expectAppError(subscribeToPush(), 'not-configured')
  })

  it('throws not-configured when the VAPID key is malformed', async () => {
    mockEnv.vapidPublicKey = 'not-a-real-key'
    configureSupabase()
    await expectAppError(subscribeToPush(), 'not-configured')
  })
})

describe('push subscription', () => {
  beforeEach(() => {
    mockEnv.vapidPublicKey = VALID_KEY
    configureSupabase()
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

  it('subscribes with the VAPID key and registers the subscription in Supabase', async () => {
    const { pushManager } = stubPushPlatform('granted')
    await subscribeToPush({ locale: 'pt-PT' })
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array(VALID_KEY_BYTES),
    })
    expect(registerPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a', locale: 'pt-PT' }),
    )
  })

  it('reports the device platform so a campaign can target Android', async () => {
    stubPushPlatform('granted')
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36')
    await subscribeToPush()
    expect(registerPushSubscription).toHaveBeenCalledWith(expect.objectContaining({ platform: 'android' }))
  })

  it('does not keep a subscription the server could not register for the user', async () => {
    stubPushPlatform('granted')
    vi.mocked(registerPushSubscription).mockRejectedValueOnce(new AppError('unavailable'))
    await expectAppError(subscribeToPush(), 'unavailable')
  })

  it('unsubscribes locally and reports false when there is nothing to remove', async () => {
    const { pushManager, subscription } = stubPushPlatform('granted')
    await expect(unsubscribeFromPush()).resolves.toBe(false)
    pushManager.getSubscription.mockResolvedValueOnce(subscription)
    await expect(unsubscribeFromPush()).resolves.toBe(true)
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(unregisterPushSubscription).toHaveBeenCalledWith('https://push.example/abc')
  })

  it('still unsubscribes locally when the server cannot be told', async () => {
    const { pushManager, subscription } = stubPushPlatform('granted')
    pushManager.getSubscription.mockResolvedValueOnce(subscription)
    vi.mocked(unregisterPushSubscription).mockRejectedValueOnce(new AppError('offline'))
    await expect(unsubscribeFromPush()).resolves.toBe(true)
  })
})
