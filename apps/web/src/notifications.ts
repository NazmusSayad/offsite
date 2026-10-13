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

export function pushSupport() {
  if (!window.isSecureContext) return 'insecure'
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  )
    return isAppleMobile() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'supported'
}

function isAppleMobile() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  )
}

export async function pushSubscribed() {
  const registration = await navigator.serviceWorker.ready
  return (await registration.pushManager.getSubscription()) !== null
}

export async function subscribePush() {
  if (Notification.permission === 'default')
    await Notification.requestPermission()
  if (Notification.permission !== 'granted') return false
  await resubscribePush(await pushKey())
  return true
}

async function pushKey() {
  const response = await fetch('/api/push/key')
  if (!response.ok) throw new Error(await response.text())
  const key = (await response.json()) as { publicKey: string }
  return key.publicKey
}

async function resubscribePush(key: string) {
  await unsubscribePush()
  const registration = await navigator.serviceWorker.ready
  await savePushSubscription(
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    })
  )
}

export async function unsubscribePush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const response = await fetch('/api/push/subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  if (!response.ok) throw new Error(await response.text())
  await subscription.unsubscribe()
}

export async function refreshPushSubscription() {
  if (pushSupport() !== 'supported') return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const key = await pushKey()
  const current = subscription.options.applicationServerKey
  if (current !== null && base64Url(current) === key)
    await savePushSubscription(subscription)
  else await resubscribePush(key)
}

function base64Url(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function savePushSubscription(subscription: PushSubscription) {
  const response = await fetch('/api/push/subscription', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!response.ok) throw new Error(await response.text())
}
