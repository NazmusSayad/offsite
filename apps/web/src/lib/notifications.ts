import type { PushSubscriptionInfo } from '@offsite/core/protocol'
import { call } from '@/api/connection'
import { home, machineKey } from '@/api/machines'
import { providerNames } from './format'
import { getState, openSession } from './store'

const storageKey = 'notifications'

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

export function notify(machine: string, ids: string[], what: string) {
  if (!document.hidden) return
  for (const id of ids) {
    const session = findSession(machine, id)
    show(
      machine,
      id,
      `${session === undefined ? 'Agent' : providerNames[session.provider]} ${what}`,
      session?.title ?? 'Session',
      machineKey(machine, id)
    )
  }
}

export function push(machine: string, sessionId: string, message: string) {
  show(
    machine,
    sessionId,
    findSession(machine, sessionId)?.title ?? 'Session',
    message,
    `push:${machineKey(machine, sessionId)}`
  )
}

function findSession(machine: string, id: string) {
  return getState().sessions.find(
    (item) => item.machine === machine && item.id === id
  )
}

function show(
  machine: string,
  sessionId: string,
  title: string,
  body: string,
  tag: string
) {
  if (notificationPermission() !== 'granted' || !notificationsWanted()) return
  const notification = new Notification(title, { body, tag })
  notification.onclick = () => {
    window.focus()
    const session = findSession(machine, sessionId)
    if (session !== undefined)
      openSession({ machine, cwd: session.cwd, sessionId })
  }
}

export async function showNotification(
  title: string,
  body: string,
  tab: { machine: string; cwd: string; tabId: number }
) {
  if (notificationPermission() !== 'granted' || !notificationsWanted()) return
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
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
  const key = await call(home, 'push.key', undefined)
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
  await call(home, 'push.unsubscribe', { endpoint: subscription.endpoint })
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
  await call(
    home,
    'push.subscribe',
    subscription.toJSON() as PushSubscriptionInfo
  )
}
