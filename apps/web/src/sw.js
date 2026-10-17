import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { readToken } from './lib/tokens'

self.skipWaiting()
clientsClaim()

if (
  import.meta.env.PROD &&
  new URL(self.location.href).searchParams.has('pwa')
) {
  precacheAndRoute(self.__WB_MANIFEST)
  cleanupOutdatedCaches()
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
}

self.addEventListener('push', (event) => {
  const message = readMessage(event.data)
  event.waitUntil(
    message
      ? self.registration.showNotification(message.title, {
          body: message.body,
          data: {
            machine: message.machineId,
            project: message.projectId,
            tabId: message.tabId,
          },
        })
      : self.registration.showNotification('offsite', { data: null })
  )
})

function readMessage(data) {
  if (!data) return null
  try {
    return data.json()
  } catch {
    return null
  }
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(renewSubscription(event))
})

async function renewSubscription(event) {
  const keys = await stored('/push-keys')
  if (!keys) return
  const machines = (await stored('/machines')) ?? []
  const subscription =
    event.newSubscription ??
    (await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keys.publicKey,
    }))
  await Promise.allSettled(
    machines.map(async (machine) => {
      if (event.oldSubscription)
        await call(machine, 'push.unsubscribe', {
          endpoint: event.oldSubscription.endpoint,
        })
      await call(machine, 'push.subscribe', {
        subscription: subscription.toJSON(),
        ...keys,
        machine: machine.id,
      })
    })
  )
}

async function stored(path) {
  const cache = await caches.open('offsite-worker')
  const response = await cache.match(path)
  return response ? response.json() : null
}

async function call(machine, method, params) {
  let failure
  for (const address of machine.addresses) {
    try {
      return await callAddress(address, machine.id, method, params)
    } catch (error) {
      failure ??= error
    }
  }
  throw failure
}

async function callAddress(address, id, method, params) {
  const token = await readToken(id)
  const response = await fetch(`${address}/api/ticket`, {
    method: 'POST',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(await response.text())
  const body = await response.json()
  const query =
    body.ticket === null
      ? ''
      : `?${new URLSearchParams({ ticket: body.ticket })}`
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(`${address.replace(/^http/, 'ws')}/ws${query}`)
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }))
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type !== 'reply') return
      socket.close()
      if ('error' in message) reject(new Error(message.error))
      else resolve(message.result)
    }
    socket.onclose = () => reject(new Error('offsite closed the connection'))
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(openTab(event.notification.data))
})

async function openTab(tab) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const page = windows[0]
  if (!page) {
    await self.clients.openWindow(tab ? `/?${tabParams(tab)}` : '/')
    return
  }
  if (tab)
    page.postMessage({
      type: 'select',
      machine: tab.machine,
      project: tab.project,
      tabId: tab.tabId,
    })
  await page.focus()
}

function tabParams(tab) {
  const params = new URLSearchParams()
  params.set('machine', tab.machine)
  params.set('project', tab.project)
  params.set('terminal', String(tab.tabId))
  return params
}
