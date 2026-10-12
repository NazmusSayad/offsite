self.addEventListener('push', (event) => {
  const message = event.data.json()
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icon-192.png',
      data: { groupId: message.groupId, tabId: message.tabId },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openTab(event.notification.data))
})

async function openTab(tab) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const page = windows.find(
    (client) => new URL(client.url).pathname !== '/settings'
  )
  if (!page) {
    await self.clients.openWindow(`/?group=${tab.groupId}&tab=${tab.tabId}`)
    return
  }
  page.postMessage({ type: 'select', groupId: tab.groupId, tabId: tab.tabId })
  await page.focus()
}
