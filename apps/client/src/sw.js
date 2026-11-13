import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { isNoticeData, showNotice } from './lib/notices'
import { readToken } from './lib/tokens'

self.skipWaiting()
clientsClaim()

if (
  import.meta.env.PROD &&
  new URL(self.location.href).searchParams.has('pwa')
) {
  precacheAndRoute(self.__WB_MANIFEST)
  cleanupOutdatedCaches()
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
      denylist: [/^\/api\//],
    })
  )
}

self.addEventListener('push', (event) => {
  event.waitUntil(showPushed(event.data))
})

async function showPushed(data) {
  const message = readMessage(data)
  if (message === null) {
    await self.registration.showNotification('OffSite', { data: null })
    return
  }
  const machines = (await stored('/machines')) ?? []
  const machine = machines.find((item) => item.id === message.machineId)
  await showNotice(
    self.registration,
    message.machineId,
    message,
    machine?.addresses[0] ?? null
  )
}

function readMessage(data) {
  if (!data) {
    return null
  }
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
  if (!keys) {
    return
  }
  const machines = (await stored('/machines')) ?? []
  const subscription =
    event.newSubscription ??
    (await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keys.publicKey,
    }))
  await Promise.allSettled(
    machines.map(async (machine) => {
      if (event.oldSubscription) {
        await call(machine, 'push.unsubscribe', {
          endpoint: event.oldSubscription.endpoint,
        })
      }
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
  if (!response.ok) {
    throw new Error(await response.text())
  }
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
      if (message.type !== 'reply') {
        return
      }
      socket.close()
      if ('error' in message) {
        reject(new Error(message.error))
      } else {
        resolve(message.result)
      }
    }
    socket.onclose = () => reject(new Error('offsite closed the connection'))
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clickNotice(event.notification.data, event.action))
})

async function clickNotice(data, actionId) {
  if (!isNoticeData(data)) {
    await openTarget(null, null, 'open')
    return
  }
  const action = data.notice.actions.find((item) => item.id === actionId)
  if (action?.kind === 'run') {
    const machines = (await stored('/machines')) ?? []
    const machine = machines.find((item) => item.id === data.machine)
    try {
      await call(machine, 'notices.act', {
        id: data.notice.id,
        action: action.id,
      })
      return
    } catch (error) {
      console.error('could not run the notification action', error)
    }
  }
  await openTarget(data.machine, data.notice, action?.kind ?? 'open')
}

async function openTarget(machine, notice, kind) {
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const message = notice === null ? null : pageMessage(machine, notice, kind)
  const page = windows[0]
  if (page) {
    if (message !== null) {
      page.postMessage(message)
    }
    await page.focus()
    return
  }
  await self.clients.openWindow(
    notice === null ? '/' : targetUrl(machine, notice.target, kind)
  )
}

function pageMessage(machine, notice, kind) {
  return {
    type: 'openSession',
    machine,
    project: notice.target.projectId,
    sessionId: notice.target.sessionId,
    panel: kind === 'diff' ? 'diff' : null,
  }
}

function targetUrl(machine, target, kind) {
  const params = new URLSearchParams()
  params.set('machine', machine)
  params.set('project', target.projectId)
  params.set('session', target.sessionId)
  if (kind === 'diff') {
    params.set('panel', 'diff')
  }
  return `/?${params}`
}
