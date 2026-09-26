import { afterEach, describe, expect, it, vi } from 'vitest'
import { getNotificationPermission, isPushSupported, requestNotificationPermission } from './permission'

/** Minimal stand-in for the browser Notification API: the prompt answer is decided per test. */
function stubNotification(initial: NotificationPermission, answer?: NotificationPermission) {
  const requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
    if (answer) MockNotification.permission = answer
    return MockNotification.permission
  })
  class MockNotification {
    static permission: NotificationPermission = initial
    static requestPermission = requestPermission
  }
  vi.stubGlobal('Notification', MockNotification)
  return { requestPermission, MockNotification }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('notification permission', () => {
  it('reports unsupported when the Notification API is missing', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(getNotificationPermission()).toBe('unsupported')
    expect(isPushSupported()).toBe(false)
    await expect(requestNotificationPermission()).resolves.toBe('unsupported')
  })

  it('asks the browser when the state is default and returns its answer (granted)', async () => {
    const { requestPermission } = stubNotification('default', 'granted')
    expect(getNotificationPermission()).toBe('default')
    await expect(requestNotificationPermission()).resolves.toBe('granted')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(getNotificationPermission()).toBe('granted')
  })

  it('returns denied when the user blocks the prompt', async () => {
    stubNotification('default', 'denied')
    await expect(requestNotificationPermission()).resolves.toBe('denied')
  })

  it('never fakes granted when the user dismisses the prompt', async () => {
    const { requestPermission } = stubNotification('default')
    await expect(requestNotificationPermission()).resolves.toBe('default')
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('does not prompt again once denied (only browser settings can change it)', async () => {
    const { requestPermission } = stubNotification('denied')
    expect(getNotificationPermission()).toBe('denied')
    await expect(requestNotificationPermission()).resolves.toBe('denied')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('reports the real, unchanged state when the browser throws', async () => {
    const { requestPermission } = stubNotification('default')
    requestPermission.mockRejectedValueOnce(new DOMException('not a user gesture', 'NotAllowedError'))
    await expect(requestNotificationPermission()).resolves.toBe('default')
  })
})
