/*
 * Erasmus Help — push messages and notification clicks (imported by the generated Workbox service worker, see vite.config.ts).
 *
 * Push: the `send-push` Edge Function sends JSON { title, body, url, tag } already written in the language chosen by
 * the user. Every field is validated here; a push the browser delivers must always end in a visible notification
 * (userVisibleOnly), so an unreadable payload still shows a generic one.
 * Click: notifications carry `data.url`, an in-app path (/chat, /chat/<id>, /settings/permissions — keep in sync with
 * src/services/notifications/paths.ts). A click focuses an open window of the app and asks it to navigate there (the
 * page listens for { type: 'eh:open-url' }), or opens a new window.
 */
const TARGET = /^\/(?:chat(?:\/[A-Za-z0-9-]+)?|settings\/permissions)$/
const TAG = /^[A-Za-z0-9_-]{1,64}$/
const ICON = '/brand/pwa-192x192.png'

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function readPush(event) {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }
  const body = data && typeof data === 'object' ? data : {}
  return {
    title: text(body.title, 120) || 'Erasmus Help',
    body: text(body.body, 300),
    url: typeof body.url === 'string' && TARGET.test(body.url) ? body.url : '/',
    tag: typeof body.tag === 'string' && TAG.test(body.tag) ? body.tag : undefined,
  }
}

self.addEventListener('push', (event) => {
  const push = readPush(event)
  event.waitUntil(
    self.registration.showNotification(push.title, {
      body: push.body,
      icon: ICON,
      tag: push.tag,
      data: { url: push.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data
  const url = data && typeof data.url === 'string' && TARGET.test(data.url) ? data.url : '/'
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        client.postMessage({ type: 'eh:open-url', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
