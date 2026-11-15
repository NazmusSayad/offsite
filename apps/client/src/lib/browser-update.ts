import { Workbox } from 'workbox-window'
import { logger } from '@/lib/log'
import { update } from '@/lib/store'

const CHECK_INTERVAL = 60 * 60_000
const RELOAD_GAP = 30_000
const RELOADED_AT = 'offsite-reloaded-at'

const log = logger.withTag('app')

let workbox: Workbox | undefined

export async function startBrowserUpdates() {
  addEventListener('vite:preloadError', () => {
    const reloadedAt = sessionStorage.getItem(RELOADED_AT)
    if (reloadedAt !== null && Date.now() - Number(reloadedAt) < RELOAD_GAP) {
      return
    }
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
    location.reload()
  })
  if (!('serviceWorker' in navigator)) {
    return
  }
  const pwa = document.querySelector('link[rel="manifest"]') !== null
  const registered = new Workbox(
    import.meta.env.DEV ? '/dev-sw.js?dev-sw' : pwa ? '/sw.js?pwa' : '/sw.js',
    { type: import.meta.env.DEV ? 'module' : 'classic' }
  )
  workbox = registered
  registered.addEventListener('waiting', () => update({ browserUpdate: true }))
  registered.addEventListener('controlling', (event) => {
    if (event.isUpdate === true || event.isExternal === true) {
      location.reload()
    }
  })
  await registered.register()
  setInterval(() => {
    registered
      .update()
      .catch((error: unknown) =>
        log.warn('could not check for a browser update', error)
      )
  }, CHECK_INTERVAL)
}

export async function checkBrowserUpdate(
  registration: ServiceWorkerRegistration
) {
  await registration.update()
  if (registration.installing !== null) {
    await reached(registration.installing, ['installed', 'activated'])
  }
  return registration.waiting !== null
}

export async function applyBrowserUpdate() {
  const registration = await navigator.serviceWorker.getRegistration()
  if (workbox === undefined || registration?.waiting == null) {
    throw new Error('the new version is no longer waiting')
  }
  workbox.messageSkipWaiting()
}

async function reached(worker: ServiceWorker, states: ServiceWorkerState[]) {
  await new Promise<void>((resolve, reject) => {
    function settle() {
      if (states.includes(worker.state)) {
        resolve()
      }
      if (worker.state === 'redundant') {
        reject(new Error('the new version failed to install'))
      }
    }
    worker.addEventListener('statechange', settle)
    settle()
  })
}
