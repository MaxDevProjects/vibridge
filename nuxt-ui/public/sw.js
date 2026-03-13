self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title
    : 'ViBridge'
  const body = typeof payload.body === 'string' ? payload.body : ''

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/nuxt-ui/logo.svg',
      badge: '/nuxt-ui/logo.svg',
      data: typeof payload.data === 'object' && payload.data ? payload.data : {},
      tag: 'vibridge-agent-notification',
      renotify: true,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clients.find((client) => client.url.includes('vibridge.clowerstudio.com'))

    if (existing) {
      await existing.focus()
      return
    }

    await self.clients.openWindow('https://vibridge.clowerstudio.com')
  })())
})
