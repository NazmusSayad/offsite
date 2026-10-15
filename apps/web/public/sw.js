self.addEventListener('push', (event) => {
  const message = readMessage(event.data)
  event.waitUntil(
    message
      ? self.registration.showNotification(message.title, {
          body: message.body,
          data: { cwd: message.cwd, tabId: message.tabId },
        })
      : self.registration.showNotification('offsite', { data: null })
  )
})

function readMessage(data) {
  if (!data) return null
  try {
    return data.json()
  } catch {
    return null
  }
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event))
})

async function renewSubscription(event) {
  if (event.oldSubscription)
    await call('push.unsubscribe', {
      endpoint: event.oldSubscription.endpoint,
    })
  const subscription = event.newSubscription ?? (await subscribeWithServerKey())
  await call('push.subscribe', subscription.toJSON())
}

async function subscribeWithServerKey() {
  const key = await call('push.key')
  return self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key.publicKey,
  })
}

function call(method, params) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${self.location.protocol === 'https:' ? 'wss' : 'ws'}://${self.location.host}/ws`
    )
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }))
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type !== 'reply') return
      socket.close()
      if ('error' in message) reject(new Error(message.error))
      else resolve(message.result)
    }
    socket.onclose = () => reject(new Error('offsite closed the connection'))
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openTab(event.notification.data))
})

async function openTab(tab) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const page = windows[0]
  if (!page) {
    await self.clients.openWindow(
      tab
        ? `/?${new URLSearchParams({ cwd: tab.cwd, terminal: String(tab.tabId) })}`
        : '/'
    )
    return
  }
  if (tab) page.postMessage({ type: 'select', cwd: tab.cwd, tabId: tab.tabId })
  await page.focus()
}
