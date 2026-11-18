import { call } from '@/api/connection'
import { logger } from './log'
import { browserId, connectedMachines } from './notifications'

const log = logger.withTag('presence')

const PING_INTERVAL = 1000

const pingEvents = [
  'keydown',
  'pointerdown',
  'pointermove',
  'wheel',
  'touchmove',
  'focus',
]

let batch: { url: string; events: Set<string>; timer: number } | null = null

export function startPresence() {
  for (const name of pingEvents) {
    addEventListener(name, note, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', note)
}

export function reportPresence(machine: string) {
  if (!document.hidden) {
    ping([machine], location.href, [])
  }
}

function note(event: Event) {
  if (document.hidden) {
    return
  }
  const url = location.href
  if (batch !== null && batch.url !== url) {
    send(batch)
  }
  if (batch === null) {
    const created = {
      url,
      events: new Set<string>(),
      timer: window.setTimeout(() => send(created), PING_INTERVAL),
    }
    batch = created
  }
  batch.events.add(event.type)
}

function send(sent: { url: string; events: Set<string>; timer: number }) {
  window.clearTimeout(sent.timer)
  batch = null
  ping(connectedMachines(), sent.url, [...sent.events])
}

function ping(machines: string[], url: string, events: string[]) {
  Promise.all(
    machines.map((machine) =>
      call(machine, 'presence.ping', { browser: browserId(), url, events })
    )
  ).catch((error: unknown) =>
    log.error('could not tell the server that this page is in use', error)
  )
}
