import { logger } from '@/lib/log'
import { update } from '@/lib/store'

const CHECK_INTERVAL = 60 * 60_000

const log = logger.withTag('app')

export function watchBrowserUpdate(registration: ServiceWorkerRegistration) {
  function track() {
    update({ browserUpdate: registration.waiting !== null })
  }
  registration.addEventListener('updatefound', () => {
    if (registration.installing === null) {
      throw new Error('a found update has no installing worker')
    }
    registration.installing.addEventListener('statechange', track)
  })
  track()
  setInterval(() => {
    registration
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
  if (registration === undefined || registration.waiting === null) {
    throw new Error('the new version is no longer waiting')
  }
  const worker = registration.waiting
  worker.postMessage({ type: 'skipWaiting' })
  await reached(worker, ['activated'])
  location.reload()
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
