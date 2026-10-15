import { randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import path from 'node:path'
import webPush from 'web-push'
import type { PushSubscriptionInfo, TerminalPush } from './protocol.ts'
import { home, readJson, writeJson } from './storage.ts'

type Subscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  server: string | null
}

type Store = {
  publicKey: string
  privateKey: string
  subscriptions: Subscription[]
}

const pushFile = path.join(home, 'push.json')
const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const TIME_TO_LIVE = 15 * 60
const SEND_TIMEOUT = 10_000
const SUBJECT = 'https://github.com/NazmusSayad/offsite'

let server = ''
let active = false

export function startPush(address: string) {
  server = address
  try {
    const store = readJson('push.json') as Store | null
    if (store !== null) track(store)
  } catch (error) {
    console.warn(
      `push notifications are off until a browser turns them on again, could not read ${pushFile}: ${error}`
    )
  }
}

export function pushActive() {
  return active
}

export function pushKey() {
  return { publicKey: read().publicKey }
}

export function subscribe(subscription: PushSubscriptionInfo) {
  const endpoint = new URL(subscription.endpoint)
  if (endpoint.protocol !== 'https:')
    throw new Error('the endpoint must be an https URL')
  update((store) => {
    store.subscriptions = store.subscriptions.filter(
      (existing) => existing.endpoint !== subscription.endpoint
    )
    store.subscriptions.push({
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      server,
    })
  })
  console.log('a browser subscribed to push notifications')
}

export function unsubscribe(endpoint: string) {
  update((store) => {
    store.subscriptions = store.subscriptions.filter(
      (existing) => existing.endpoint !== endpoint
    )
  })
  console.log('a browser unsubscribed from push notifications')
}

export async function sendPush(message: TerminalPush) {
  let store: Store
  try {
    store = read()
  } catch (error) {
    console.error(`could not read push subscriptions: ${error}`)
    return
  }
  const subscriptions = store.subscriptions.filter(ours)
  if (subscriptions.length === 0) return
  const payload = JSON.stringify({
    ...message,
    title: [...message.title].slice(0, TITLE_LIMIT).join(''),
    body: [...message.body].slice(0, BODY_LIMIT).join(''),
  })
  const gone: string[] = []
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(subscription, payload, {
          vapidDetails: {
            subject: SUBJECT,
            publicKey: store.publicKey,
            privateKey: store.privateKey,
          },
          TTL: TIME_TO_LIVE,
          urgency: 'high',
          timeout: SEND_TIMEOUT,
        })
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
  try {
    update((current) => {
      current.subscriptions = current.subscriptions.filter(
        (subscription) => !gone.includes(subscription.endpoint)
      )
    })
  } catch (error) {
    console.error(`could not remove gone push subscriptions: ${error}`)
  }
}

function ours(subscription: Subscription) {
  return subscription.server === server
}

function track(store: Store) {
  active = store.subscriptions.some(ours)
}

function load(): Store {
  let store: Store | null
  try {
    store = readJson('push.json') as Store | null
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return replaceCorrupt(error)
  }
  if (store === null) return create()
  if (
    typeof store.publicKey !== 'string' ||
    typeof store.privateKey !== 'string' ||
    !Array.isArray(store.subscriptions)
  )
    return replaceCorrupt(new Error('it is missing its keys or subscriptions'))
  return store
}

function replaceCorrupt(error: Error) {
  const aside = `${pushFile}.corrupt-${randomUUID()}`
  renameSync(pushFile, aside)
  console.warn(
    `${pushFile} is corrupt, moved it to ${aside} and created a new one: ${error}`
  )
  return create()
}

function create(): Store {
  const keys = webPush.generateVAPIDKeys()
  const store = { ...keys, subscriptions: [] }
  save(store)
  return store
}

function save(store: Store) {
  writeJson('push.json', store)
}

function read() {
  const store = load()
  track(store)
  return store
}

function update(change: (store: Store) => void) {
  const store = load()
  change(store)
  save(store)
  track(store)
}
