const storageKey = 'sshtty-notifications'

export function notificationPermission() {
  if (!window.isSecureContext) return 'insecure'
  if (!('Notification' in window) || !('serviceWorker' in navigator))
    return 'unsupported'
  return Notification.permission
}

export function notificationsWanted() {
  const stored = localStorage.getItem(storageKey)
  if (stored === null || stored === 'on') return true
  if (stored === 'off') return false
  throw new Error(`unknown notification setting ${stored}`)
}

export async function setNotificationsWanted(wanted: boolean) {
  if (wanted && Notification.permission === 'default')
    await Notification.requestPermission()
  localStorage.setItem(storageKey, wanted ? 'on' : 'off')
}

export async function watchPermission(
  signal: AbortSignal,
  listener: () => void
) {
  const status = await navigator.permissions.query({ name: 'notifications' })
  status.addEventListener('change', listener, { signal })
}

export async function showNotification(
  title: string,
  body: string,
  tab: { groupId: number; tabId: number }
) {
  if (notificationPermission() !== 'granted' || !notificationsWanted()) return
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    data: tab,
  })
}
