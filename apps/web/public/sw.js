self.addEventListener('push', (event) => {
  const message = readMessage(event.data)
  event.waitUntil(
    message
      ? self.registration.showNotification(message.title, {
          body: message.body,
          icon: '/icon-192.png',
          data: { groupId: message.groupId, tabId: message.tabId },
        })
      : self.registration.showNotification('sshtty', {
          icon: '/icon-192.png',
          data: null,
        })
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
    await request('DELETE', { endpoint: event.oldSubscription.endpoint })
  const subscription = event.newSubscription ?? (await subscribeWithServerKey())
  await request('PUT', subscription)
}

async function subscribeWithServerKey() {
  const response = await fetch('/api/push/key')
  if (!response.ok) throw new Error(await response.text())
  const key = await response.json()
  return self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key.publicKey,
  })
}

async function request(method, body) {
  const response = await fetch('/api/push/subscription', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await response.text())
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
      tab ? `/?group=${tab.groupId}&tab=${tab.tabId}` : '/'
    )
    return
  }
  if (tab)
    page.postMessage({ type: 'select', groupId: tab.groupId, tabId: tab.tabId })
  await page.focus()
}
