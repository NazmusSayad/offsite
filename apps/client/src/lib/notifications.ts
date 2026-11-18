import type { PushNotification, PushSubscriptionInfo } from '@offsite/core/push'
import { useEffect } from 'react'
import { call, isConnected, machineUrl } from '@/api/connection'
import { logger } from '@/lib/log'
import { randomId } from '@/lib/utils'
import {
  isNotificationData,
  removeNotifications,
  showPushNotification,
} from './push-notifications'
import { router } from './router'
import { activityOf, getState, threadState, useStore } from './store'
import { currentSearch } from './url'
import { wide } from './utils'

const log = logger.withTag('notifications')

type PushKeys = { publicKey: string; privateKey: string }

const storageKey = 'notifications'
const browserKey = 'browser'

let pushWork: Promise<unknown> = Promise.resolve()

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

export async function showNotificationHere(
  machine: string,
  notification: PushNotification,
  pushed: boolean
) {
  if (
    notificationPermission() !== 'granted' ||
    !notificationsWanted() ||
    (!notification.whileVisible &&
      alreadySeen(machine, notification.target.sessionId)) ||
    (pushed && pushSupport() === 'supported' && (await pushSubscribed()))
  ) {
    return
  }
  const registration = await navigator.serviceWorker.ready
  await navigator.locks.request(`notification ${notification.id}`, async () => {
    const shown = await registration.getNotifications()
    if (
      shown.some(
        (item) =>
          isNotificationData(item.data) &&
          item.data.notification.id === notification.id
      )
    ) {
      return
    }
    await showPushNotification(
      registration,
      machine,
      notification,
      machineUrl(machine)
    )
  })
}

export async function dismissNotifications(machine: string, tag: string) {
  if (notificationPermission() !== 'granted') {
    return
  }
  const registration = await navigator.serviceWorker.ready
  await removeNotifications(
    registration,
    (entry) => entry.machine === machine && entry.notification.tag === tag
  )
}

export async function dropSeenNotifications(machine: string) {
  if (notificationPermission() !== 'granted') {
    return
  }
  const registration = await navigator.serviceWorker.ready
  const ids = (await registration.getNotifications()).flatMap((item) =>
    isNotificationData(item.data)
      ? item.data.digest
          .filter((entry) => entry.machine === machine)
          .map((entry) => entry.notification.id)
      : []
  )
  if (ids.length === 0) {
    return
  }
  const seen = await call(machine, 'notifications.dismissed', { ids })
  await removeNotifications(
    registration,
    (entry) => entry.machine === machine && seen.includes(entry.notification.id)
  )
}

export async function answerAwake(machine: string, id: string) {
  await call(machine, 'notifications.awake', { id, browser: browserId() })
}

export function rememberBrowser() {
  if (window.isSecureContext) {
    saveBrowserId().catch((error: unknown) =>
      log.error('could not save this browser for the service worker', error)
    )
  }
}

function inUse() {
  return !document.hidden && document.hasFocus()
}

export function browserId() {
  const stored = localStorage.getItem(browserKey)
  if (stored !== null) {
    return stored
  }
  const created = randomId()
  localStorage.setItem(browserKey, created)
  return created
}

async function saveBrowserId() {
  const cache = await caches.open('offsite-worker')
  await cache.put('/browser', new Response(JSON.stringify(browserId())))
}

export function alreadySeen(machine: string, sessionId: string) {
  return (
    watching(machine, sessionId) ||
    (inUse() &&
      (wide.matches ||
        (router.history.location.pathname === '/' &&
          getState().selection === null)))
  )
}

export function watching(machine: string, sessionId: string) {
  if (!inUse()) {
    return false
  }
  const search = currentSearch()
  return (
    router.history.location.pathname === '/' &&
    search.machine === machine &&
    search.session === sessionId
  )
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

export function connectedMachines() {
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

export function useAttentionBadge() {
  const count = useStore(
    (state) =>
      state.sessions.filter((session) => {
        const thread = threadState(
          activityOf(state.machines, session.machine, session.id),
          session.unread
        )
        return thread.waiting || thread.done
      }).length
  )
  useEffect(() => {
    document.title = count === 0 ? 'OffSite' : `(${count}) OffSite`
    if (!('setAppBadge' in navigator)) {
      return
    }
    const badge =
      count === 0 ? navigator.clearAppBadge() : navigator.setAppBadge(count)
    badge.catch((error: unknown) =>
      log.error('could not update the app badge', error)
    )
  }, [count])
}
