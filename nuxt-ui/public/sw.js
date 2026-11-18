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
      tag: 'vibridge-' + String(payload.data?.windowId || 'general').slice(0, 70),
      renotify: true,
    }),
  )
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil((async () => {
    const notificationData = event.notification?.data && typeof event.notification.data === 'object'
      ? event.notification.data
      : {}
    const sessionId = typeof notificationData.sessionId === 'string' ? notificationData.sessionId.trim() : ''
    const workspaceId = typeof notificationData.workspaceId === 'string' ? notificationData.workspaceId.trim() : ''
    const targetUrl = new URL(self.registration.scope)

    if (sessionId) targetUrl.searchParams.set('session', sessionId)
    if (workspaceId) targetUrl.searchParams.set('workspace', workspaceId)
    const windowId = typeof notificationData.windowId === 'string' ? notificationData.windowId.trim() : ''
    const terminalId = typeof notificationData.terminalId === 'string' ? notificationData.terminalId.trim() : ''
    if (/^[a-zA-Z0-9-]{1,80}$/.test(windowId)) targetUrl.searchParams.set('window', windowId)
    if (/^[a-zA-Z0-9-]{1,90}$/.test(terminalId)) targetUrl.searchParams.set('terminal', terminalId)

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const targetHref = targetUrl.toString()
    const existing = clients.find((client) => {
      try {
        const currentUrl = new URL(client.url)
        return currentUrl.origin === targetUrl.origin
      } catch {
        return false
      }
    })

    if (existing) {
      await existing.focus()
      if ('navigate' in existing) {
        await existing.navigate(targetHref)
      }
      return
    }

    await self.clients.openWindow(targetHref)
  })())
})
