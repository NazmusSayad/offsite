import type { Notice, NoticeState } from '@offsite/core/push'

export type NoticeData = {
  machine: string
  notice: Notice
  digest: { machine: string; notice: Notice }[]
}

type ShowOptions = NotificationOptions & {
  actions: { action: string; title: string }[]
  image?: string
  renotify: boolean
}

const DIGEST_FROM = 3

const urgency: Record<NoticeState, number> = {
  asks: 5,
  approve: 5,
  'not-sent': 4,
  push: 3,
  done: 2,
}

const marks: Record<NoticeState, string> = {
  asks: '?',
  approve: '?',
  'not-sent': '!',
  push: '•',
  done: '✓',
}

export async function showNotice(
  registration: ServiceWorkerRegistration,
  machine: string,
  notice: Notice,
  address: string | null
) {
  const entry = { machine, notice }
  const shown = (await registration.getNotifications()).filter(
    (item) => isNoticeData(item.data) && item.tag !== notice.tag
  )
  const entries = [
    entry,
    ...shown.flatMap((item) =>
      isNoticeData(item.data) ? item.data.digest : []
    ),
  ].filter(
    (item, index, all) =>
      all.findIndex((other) => other.notice.tag === item.notice.tag) === index
  )
  if (entries.length < DIGEST_FROM) {
    await registration.showNotification(
      notice.title,
      options(notice, { machine, notice, digest: [entry] }, address)
    )
    return
  }
  const urgent = entries.reduce((top, item) =>
    urgency[item.notice.state] > urgency[top.notice.state] ? item : top
  )
  for (const item of shown) {
    item.close()
  }
  await registration.showNotification('While you were away', {
    ...options(
      urgent.notice,
      { machine: urgent.machine, notice: urgent.notice, digest: entries },
      null
    ),
    body: entries
      .map(
        (item) =>
          `${marks[item.notice.state]} ${item.notice.title} — ${item.notice.summary}`
      )
      .join('\n'),
    tag: 'digest',
  })
}

export function isNoticeData(data: unknown): data is NoticeData {
  return typeof data === 'object' && data !== null && 'notice' in data
}

function options(
  notice: Notice,
  data: NoticeData,
  address: string | null
): ShowOptions {
  return {
    body: notice.body,
    tag: notice.tag,
    icon: `/notification-icons/${notice.source}-${notice.state}.png`,
    image:
      notice.image === null || address === null
        ? undefined
        : new URL(notice.image, address).href,
    actions: notice.actions.map((action) => ({
      action: action.id,
      title: action.title,
    })),
    renotify: true,
    data,
  }
}
