// Push handling, loaded into the generated service worker (vite.config.ts,
// workbox.importScripts). Messages come from the sync's reminders:
// { title, body, url }.

self.addEventListener('push', (event) => {
  let notice = { title: 'Bolão Capivara', body: 'Tem jogo começando sem o seu palpite.', url: '/' }
  try {
    if (event.data) notice = { ...notice, ...event.data.json() }
  } catch {
    // Keep the default text.
  }
  event.waitUntil(self.registration.showNotification(notice.title, {
    body: notice.body,
    icon: '/pwa-192x192.png',
    tag: 'reminder', // a newer reminder replaces the previous one
    data: { url: notice.url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((w) => w.url.startsWith(self.location.origin))
    if (open) {
      await open.focus()
      return open.navigate(url)
    }
    return self.clients.openWindow(url)
  })())
})
