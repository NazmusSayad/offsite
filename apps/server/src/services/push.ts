import type { Notice, PushRegistration } from '@offsite/core/push'
import { and, eq, inArray } from 'drizzle-orm'
import webPush from 'web-push'
import { type Client, clients } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { db } from '../storage/db.ts'
import { pushSubscriptions } from '../storage/schema.ts'

const log = logger.withTag('push')

const TIME_TO_LIVE = 15 * 60
const SEND_TIMEOUT = 10_000
const SILENCE_LIMIT = 90_000
const SUBJECT = 'https://github.com/NazmusSayad/offsite'

let server = ''
let notifier: { client: Client; endpoint: string | null } | null = null

export function startPush(address: string) {
  server = address
}

export function notifierConnected() {
  if (notifier === null || !clients.has(notifier.client)) {
    return false
  }
  return Date.now() - notifier.client.heardAt < SILENCE_LIMIT
}

export function claimNotifier(client: Client, endpoint: string | null) {
  notifier = { client, endpoint }
  for (const item of clients) {
    item.send({ type: 'notifier', active: item === client })
  }
}

export function subscribe(registration: PushRegistration, client: Client) {
  const endpoint = new URL(registration.subscription.endpoint)
  if (endpoint.protocol !== 'https:') {
    throw new Error('the endpoint must be an https URL')
  }
  const values = {
    endpoint: registration.subscription.endpoint,
    p256dh: registration.subscription.keys.p256dh,
    auth: registration.subscription.keys.auth,
    publicKey: registration.publicKey,
    privateKey: registration.privateKey,
    machine: registration.machine,
    server,
  }
  db.insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    .run()
  if (notifier !== null && notifier.client === client) {
    notifier.endpoint = registration.subscription.endpoint
  }
  log.info('a browser subscribed to push notifications')
}

export function unsubscribe(endpoint: string) {
  db.delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .run()
  if (notifier !== null && notifier.endpoint === endpoint) {
    notifier.endpoint = null
  }
  log.info('a browser unsubscribed from push notifications')
}

export async function sendPush(notice: Notice) {
  const subscriptions = targets()
  if (subscriptions.length === 0) {
    return false
  }
  const gone: string[] = []
  let delivered = 0
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({ ...notice, machineId: subscription.machine }),
          {
            vapidDetails: {
              subject: SUBJECT,
              publicKey: subscription.publicKey,
              privateKey: subscription.privateKey,
            },
            TTL: TIME_TO_LIVE,
            urgency: 'high',
            timeout: SEND_TIMEOUT,
          }
        )
        delivered += 1
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status !== undefined && [401, 403, 404, 410].includes(status)) {
          log.info(
            `push subscription ${subscription.endpoint} is gone or was made for another key, removing it`
          )
          gone.push(subscription.endpoint)
          return
        }
        log.warn(`could not send a push to ${subscription.endpoint}:`, error)
      }
    })
  )
  log.debug(`sent a push to ${delivered} of ${subscriptions.length} browsers`)
  if (gone.length === 0) {
    return delivered > 0
  }
  db.delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.server, server),
        inArray(pushSubscriptions.endpoint, gone)
      )
    )
    .run()
  return delivered > 0
}

function targets() {
  if (notifier === null || notifier.endpoint === null) {
    return []
  }
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.server, server),
        eq(pushSubscriptions.endpoint, notifier.endpoint)
      )
    )
    .all()
}
