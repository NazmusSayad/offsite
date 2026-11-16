import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { logger } from './log'
import { watching } from './notifications'
import { router } from './router'
import { currentSearch } from './url'

const log = logger.withTag('seen')

const SEEN_AFTER = 3000

let watched: string | null = null
let timer: number | undefined

export function startSeen() {
  addEventListener('focus', () => follow(false))
  addEventListener('blur', () => follow(false))
  document.addEventListener('visibilitychange', () => follow(false))
  router.history.subscribe(() => follow(false))
  follow(false)
}

export function restartSeen(machine: string, sessionId: string) {
  if (watched === machineKey(machine, sessionId)) {
    follow(true)
  }
}

function follow(restart: boolean) {
  const search = currentSearch()
  const machine = search.machine
  const sessionId = search.session
  const seen =
    machine !== undefined &&
    sessionId !== undefined &&
    watching(machine, sessionId)
  const current = seen ? machineKey(machine, sessionId) : null
  if (current === watched && !restart) {
    return
  }
  window.clearTimeout(timer)
  watched = current
  if (!seen) {
    return
  }
  timer = window.setTimeout(() => {
    call(machine, 'notices.seen', { sessionId }).catch((error: unknown) =>
      log.error('could not tell the server that this chat was seen', error)
    )
  }, SEEN_AFTER)
}
