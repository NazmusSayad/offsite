import type { PushNotification, NotificationState } from '@offsite/core/push'

type NotificationEntry = { machine: string; notification: PushNotification }

export type NotificationData = {
  machine: string
  notification: PushNotification
  digest: NotificationEntry[]
}

type ShowOptions = NotificationOptions & {
  actions: { action: string; title: string }[]
  image?: string
  renotify: boolean
}

const DIGEST_FROM = 3

const urgency: Record<NotificationState, number> = {
  asks: 5,
  approve: 5,
  'not-sent': 4,
  push: 3,
  done: 2,
}

const marks: Record<NotificationState, string> = {
  asks: '?',
  approve: '?',
  'not-sent': '!',
  push: '•',
  done: '✓',
}

export async function showPushNotification(
  registration: ServiceWorkerRegistration,
  machine: string,
  notification: PushNotification,
  address: string | null
) {
  const shownNotification = {
    ...notification,
    icon:
      notification.icon === null || address === null
        ? null
        : new URL(notification.icon, address).href,
  }
  const entry = { machine, notification: shownNotification }
  const shown = (await registration.getNotifications()).filter(
    (item) => isNotificationData(item.data) && item.tag !== notification.tag
  )
  const entries = [
    entry,
    ...shown.flatMap((item) =>
      isNotificationData(item.data) ? item.data.digest : []
    ),
  ].filter(
    (item, index, all) =>
      all.findIndex(
        (other) => other.notification.tag === item.notification.tag
      ) === index
  )
  if (entries.length < DIGEST_FROM) {
    await registration.showNotification(
      notification.title,
      options(
        shownNotification,
        { machine, notification: shownNotification, digest: [entry] },
        notification.image === null || address === null
          ? null
          : new URL(notification.image, address).href
      )
    )
    return
  }
  for (const item of shown) {
    item.close()
  }
  await showDigest(registration, entries, true)
}

export async function removeNotifications(
  registration: ServiceWorkerRegistration,
  gone: (entry: NotificationEntry) => boolean
) {
  for (const item of await registration.getNotifications()) {
    if (!isNotificationData(item.data)) {
      continue
    }
    const kept = item.data.digest.filter((entry) => !gone(entry))
    if (kept.length === item.data.digest.length) {
      continue
    }
    if (kept.length === 0) {
      item.close()
      continue
    }
    await showDigest(registration, kept, false)
  }
}

async function showDigest(
  registration: ServiceWorkerRegistration,
  entries: NotificationEntry[],
  renotify: boolean
) {
  const urgent = entries.reduce((top, item) =>
    urgency[item.notification.state] > urgency[top.notification.state]
      ? item
      : top
  )
  const digest: ShowOptions = {
    ...options(
      urgent.notification,
      {
        machine: urgent.machine,
        notification: urgent.notification,
        digest: entries,
      },
      null
    ),
    body: entries
      .map(
        (item) =>
          `${marks[item.notification.state]} ${item.notification.title} — ${item.notification.summary}`
      )
      .join('\n'),
    tag: 'digest',
    renotify,
  }
  await registration.showNotification('While you were away', digest)
}

export function isNotificationData(data: unknown): data is NotificationData {
  return typeof data === 'object' && data !== null && 'notification' in data
}

function options(
  notification: PushNotification,
  data: NotificationData,
  image: string | null
): ShowOptions {
  return {
    body: notification.body,
    tag: notification.tag,
    icon: notification.icon === null ? undefined : notification.icon,
    image: image === null ? undefined : image,
    actions: notification.actions.map((action) => ({
      action: action.id,
      title: action.title,
    })),
    renotify: true,
    data,
  }
}
