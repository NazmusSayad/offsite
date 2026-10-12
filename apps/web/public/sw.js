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
    await self.clients.openWindow('/')
    return
  }
  page.postMessage({ type: 'select', groupId: tab.groupId, tabId: tab.tabId })
  await page.focus()
}
