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
