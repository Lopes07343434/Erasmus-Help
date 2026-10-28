import { describe, expect, it, vi } from 'vitest'
import workerSource from '../../../public/sw-notifications.js?raw'
import { CAMPAIGNS, buildPayload } from '../../../supabase/functions/_shared/campaigns'
import { isNotificationTarget } from './paths'

/** Runs public/sw-notifications.js against a fake service-worker scope and returns its listeners. */
function loadWorker() {
  const listeners = new Map<string, (event: unknown) => void>()
  const showNotification = vi.fn(async () => undefined)
  const client = { url: 'https://app.test/chat', focus: vi.fn(async () => undefined), postMessage: vi.fn() }
  const clients = { matchAll: vi.fn(async () => [] as unknown[]), openWindow: vi.fn(async (_url: string) => undefined) }
  const scope = {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    registration: { showNotification },
    clients,
    location: { origin: 'https://app.test' },
  }
  new Function('self', workerSource)(scope)
  return { listeners, showNotification, client, clients }
}

function pushEvent(data: unknown) {
  const waits: Promise<unknown>[] = []
  return {
    event: {
      data: data === undefined ? null : { json: () => (typeof data === 'function' ? (data as () => unknown)() : data) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    done: () => Promise.all(waits),
  }
}

describe('service worker: push', () => {
  it('shows the localized notification sent by the server, opening the permissions screen', async () => {
    const { listeners, showNotification } = loadWorker()
    const payload = buildPayload('push-available', 'pl')
    const { event, done } = pushEvent(payload)
    listeners.get('push')?.(event)
    await done()
    expect(showNotification).toHaveBeenCalledWith(
      'Powiadomienia push są już dostępne',
      expect.objectContaining({ body: payload.body, tag: 'push-available', data: { url: '/settings/permissions' }, icon: '/brand/pwa-192x192.png' }),
    )
  })

  it('always shows something, even for an empty or unreadable payload (userVisibleOnly)', async () => {
    const { listeners, showNotification } = loadWorker()
    for (const data of [undefined, () => { throw new Error('not json') }, 'text', { title: 42, url: 'https://evil.test/x', tag: '<b>' }]) {
      const { event, done } = pushEvent(data)
      listeners.get('push')?.(event)
      await done()
    }
    expect(showNotification).toHaveBeenCalledTimes(4)
    for (const call of showNotification.mock.calls as unknown as Array<[string, { data: { url: string }; tag?: string }]>) {
      expect(call[0]).toBe('Erasmus Help')
      expect(call[1].data.url).toBe('/')
      expect(call[1].tag).toBeUndefined()
    }
  })
})

describe('service worker: click', () => {
  const click = (url: unknown) => {
    const close = vi.fn()
    const waits: Promise<unknown>[] = []
    return { event: { notification: { close, data: { url } }, waitUntil: (p: Promise<unknown>) => waits.push(p) }, close, done: () => Promise.all(waits) }
  }

  it('focuses an open window and asks it to open the permissions screen', async () => {
    const { listeners, clients, client } = loadWorker()
    clients.matchAll.mockResolvedValue([client])
    const { event, close, done } = click('/settings/permissions')
    listeners.get('notificationclick')?.(event)
    await done()
    expect(close).toHaveBeenCalled()
    expect(client.focus).toHaveBeenCalled()
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'eh:open-url', url: '/settings/permissions' })
  })

  it('opens a new window when the app is closed, and never navigates outside the allowed paths', async () => {
    const { listeners, clients } = loadWorker()
    for (const url of ['/settings/permissions', '/chat/abc-1', 'https://evil.test/', '/admin', '/chat/../x']) {
      const { event, done } = click(url)
      listeners.get('notificationclick')?.(event)
      await done()
    }
    expect(clients.openWindow.mock.calls.map((c) => c[0])).toEqual(['/settings/permissions', '/chat/abc-1', '/', '/', '/'])
  })
})

describe('notification targets and campaigns', () => {
  it('keeps the page-side allowlist equal to the worker one', () => {
    for (const ok of ['/chat', '/chat/abc-1', '/settings/permissions']) expect(isNotificationTarget(ok)).toBe(true)
    for (const bad of ['/', '/settings', '/admin', 'https://evil.test/', '/chat/a/b', '/settings/permissions/x', 42, null]) expect(isNotificationTarget(bad)).toBe(false)
  })

  it('writes every campaign in every UI language and opens a valid target', () => {
    for (const id of Object.keys(CAMPAIGNS) as Array<keyof typeof CAMPAIGNS>) {
      for (const locale of ['pt-PT', 'en', 'pl']) {
        const payload = buildPayload(id, locale)
        expect(payload.title.length).toBeGreaterThan(0)
        expect(payload.body.length).toBeGreaterThan(0)
        expect(isNotificationTarget(payload.url)).toBe(true)
        expect(payload.tag).toBe(id)
      }
    }
  })

  it('falls back to English for an unknown or missing language', () => {
    expect(buildPayload('push-available', null).title).toBe('Push notifications are now available')
    expect(buildPayload('push-available', 'xx').title).toBe('Push notifications are now available')
    expect(buildPayload('push-available', 'pt-PT').title).toBe('Notificações push já disponíveis')
  })
})
