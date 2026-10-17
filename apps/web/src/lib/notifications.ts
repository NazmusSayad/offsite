import type { PushSubscriptionInfo } from '@offsite/core/push'
import { call, isConnected } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { providerNames } from './format'
import { getState, machineOf } from './store'

type PushKeys = { publicKey: string; privateKey: string }

const storageKey = 'notifications'

let pushWork: Promise<unknown> = Promise.resolve()
const claiming = new Set<string>()

export function notificationPermission() {
  if (!window.isSecureContext) {
    return 'insecure'
  }
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported'
  }
  return Notification.permission
}

export function notificationsWanted() {
  const stored = localStorage.getItem(storageKey)
  if (stored === null || stored === 'on') {
    return true
  }
  if (stored === 'off') {
    return false
  }
  throw new Error(`unknown notification setting ${stored}`)
}

export async function setNotificationsWanted(wanted: boolean) {
  if (wanted && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
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
  if (!document.hidden) {
    return
  }
  for (const id of ids) {
    const session = findSession(machine, id)
    show(
      machine,
      id,
      `${session === undefined ? 'Agent' : providerNames[session.provider]} ${what}`,
      session?.title ?? 'Session',
      machineKey(machine, id)
    ).catch((error: unknown) =>
      console.error('could not show a notification', error)
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
  ).catch((error: unknown) =>
    console.error('could not show a notification', error)
  )
}

function findSession(machine: string, id: string) {
  return getState().sessions.find(
    (item) => item.machine === machine && item.id === id
  )
}

async function show(
  machine: string,
  sessionId: string,
  title: string,
  body: string,
  tag: string
) {
  if (
    notificationPermission() !== 'granted' ||
    !notificationsWanted() ||
    !machineOf(getState(), machine).notifier
  ) {
    return
  }
  const session = findSession(machine, sessionId)
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
    tag,
    data:
      session === undefined
        ? null
        : {
            kind: 'session',
            machine,
            project: session.projectId,
            sessionId,
          },
  })
}

export async function showNotification(
  title: string,
  body: string,
  tab: { machine: string; project: string; tabId: number }
) {
  if (
    notificationPermission() !== 'granted' ||
    !notificationsWanted() ||
    !machineOf(getState(), tab.machine).notifier
  ) {
    return
  }
  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
    data: { kind: 'terminal', ...tab },
  })
}

export function claimNotifications() {
  const machines = getState()
    .machines.filter(
      (machine) =>
        isConnected(machine.id) &&
        !machine.notifier &&
        !claiming.has(machine.id)
    )
    .map((machine) => machine.id)
  if (machines.length === 0) {
    return
  }
  for (const machine of machines) {
    claiming.add(machine)
  }
  pushEndpoint()
    .then((endpoint) =>
      Promise.all(
        machines.map((machine) =>
          call(machine, 'notifications.claim', { endpoint })
        )
      )
    )
    .catch((error: unknown) =>
      console.error('could not claim notifications', error)
    )
    .finally(() => {
      for (const machine of machines) {
        claiming.delete(machine)
      }
    })
}

async function pushEndpoint() {
  if (pushSupport() !== 'supported') {
    return null
  }
  const registration = await navigator.serviceWorker.getRegistration()
  if (registration === undefined) {
    return null
  }
  const subscription = await registration.pushManager.getSubscription()
  return subscription === null ? null : subscription.endpoint
}

export function pushSupport() {
  if (!window.isSecureContext) {
    return 'insecure'
  }
  if (
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return isAppleMobile() ? 'install' : 'unsupported'
  }
  if (Notification.permission === 'denied') {
    return 'denied'
  }
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
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
  if (Notification.permission !== 'granted') {
    return false
  }
  await queuePush(resubscribePush)
  return true
}

export function unsubscribePush() {
  return queuePush(removeSubscription)
}

export function refreshPushSubscription(machine: string) {
  return queuePush(async () => {
    if (pushSupport() !== 'supported') {
      return
    }
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      return
    }
    const keys = await pushKeys()
    const current = subscription.options.applicationServerKey
    if (current !== null && base64Url(current) === keys.publicKey) {
      await savePushSubscription(machine, subscription, keys)
    } else {
      await resubscribePush()
    }
  })
}

function queuePush<T>(work: () => Promise<T>) {
  const next = pushWork.then(work)
  pushWork = next.catch(() => undefined)
  return next
}

async function resubscribePush() {
  await removeSubscription()
  const keys = await pushKeys()
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keys.publicKey,
  })
  await Promise.all(
    connectedMachines().map((machine) =>
      savePushSubscription(machine, subscription, keys)
    )
  )
}

async function removeSubscription() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    return
  }
  await Promise.all(
    connectedMachines().map((machine) =>
      call(machine, 'push.unsubscribe', { endpoint: subscription.endpoint })
    )
  )
  await subscription.unsubscribe()
}

async function pushKeys(): Promise<PushKeys> {
  const cache = await caches.open('offsite-worker')
  const stored = await cache.match('/push-keys')
  if (stored !== undefined) {
    return await stored.json()
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d
  if (privateKey === undefined) {
    throw new Error('the browser did not export the push key')
  }
  const keys = {
    publicKey: base64Url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateKey,
  }
  await cache.put('/push-keys', new Response(JSON.stringify(keys)))
  return keys
}

function connectedMachines() {
  return getState()
    .machines.filter((machine) => isConnected(machine.id))
    .map((machine) => machine.id)
}

function base64Url(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function savePushSubscription(
  machine: string,
  subscription: PushSubscription,
  keys: PushKeys
) {
  await call(machine, 'push.subscribe', {
    subscription: subscription.toJSON() as PushSubscriptionInfo,
    ...keys,
    machine,
  })
}
