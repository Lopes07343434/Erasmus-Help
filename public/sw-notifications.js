/*
 * Erasmus Help — notification clicks (imported by the generated Workbox service worker, see vite.config.ts).
 * Chat notifications carry `data.url` (an in-app path such as /chat/<id>). A click focuses an open window of the
 * app and asks it to navigate there (the page listens for { type: 'eh:open-url' }), or opens a new window.
 */
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data
  const url = data && typeof data.url === 'string' && /^\/chat(?:\/[A-Za-z0-9-]+)?$/.test(data.url) ? data.url : '/'
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

/*
 * Web Push delivery (app closed). The backend sends JSON { title, body, tag?, url?, lang? }; the same shape the page
 * uses for in-app system notifications. Android requires every push to show a notification (userVisibleOnly), so a
 * malformed or empty payload still shows a generic one instead of being dropped.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    const parsed = event.data ? event.data.json() : {}
    if (parsed && typeof parsed === 'object') payload = parsed
  } catch {
    // Not JSON: fall back to the generic notification below.
  }
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')
  const title = text(payload.title, 120) || 'Erasmus Help'
  const url = typeof payload.url === 'string' && /^\/chat(?:\/[A-Za-z0-9-]+)?$/.test(payload.url) ? payload.url : '/'
  const options = {
    body: text(payload.body, 300),
    icon: '/brand/pwa-192x192.png',
    badge: '/brand/pwa-64x64.png',
    data: { url },
  }
  const tag = text(payload.tag, 64)
  if (tag) options.tag = tag
  const lang = text(payload.lang, 12)
  if (lang) options.lang = lang
  event.waitUntil(self.registration.showNotification(title, options))
})
