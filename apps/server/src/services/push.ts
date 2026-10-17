import type { PushSubscriptionInfo, TerminalPush } from '@offsite/core/protocol'
import { and, eq, inArray } from 'drizzle-orm'
import webPush from 'web-push'
import { db, machineInfo } from '../storage/db.ts'
import { pushSubscriptions } from '../storage/schema.ts'

const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const TIME_TO_LIVE = 15 * 60
const SEND_TIMEOUT = 10_000
const SUBJECT = 'https://github.com/NazmusSayad/offsite'

let server = ''

export function startPush(address: string) {
  server = address
}

export function pushActive() {
  return ours().length > 0
}

export function pushKey() {
  return { publicKey: machineInfo().pushPublicKey }
}

export function subscribe(subscription: PushSubscriptionInfo) {
  const endpoint = new URL(subscription.endpoint)
  if (endpoint.protocol !== 'https:')
    throw new Error('the endpoint must be an https URL')
  const values = {
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    server,
  }
  db.insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    .run()
  console.log('a browser subscribed to push notifications')
}

export function unsubscribe(endpoint: string) {
  db.delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .run()
  console.log('a browser unsubscribed from push notifications')
}

export async function sendPush(message: TerminalPush) {
  const subscriptions = ours()
  if (subscriptions.length === 0) return
  const keys = machineInfo()
  const payload = JSON.stringify({
    ...message,
    title: [...message.title].slice(0, TITLE_LIMIT).join(''),
    body: [...message.body].slice(0, BODY_LIMIT).join(''),
  })
  const gone: string[] = []
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          {
            vapidDetails: {
              subject: SUBJECT,
              publicKey: keys.pushPublicKey,
              privateKey: keys.pushPrivateKey,
            },
            TTL: TIME_TO_LIVE,
            urgency: 'high',
            timeout: SEND_TIMEOUT,
          }
        )
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status !== undefined && [401, 403, 404, 410].includes(status)) {
          console.log(
            `push subscription ${subscription.endpoint} is gone or was made for another key, removing it`
          )
          gone.push(subscription.endpoint)
          return
        }
        console.warn(
          `could not send a push to ${subscription.endpoint}: ${error}`
        )
      }
    })
  )
  if (gone.length === 0) return
  db.delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.server, server),
        inArray(pushSubscriptions.endpoint, gone)
      )
    )
    .run()
}

function ours() {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.server, server))
    .all()
}
