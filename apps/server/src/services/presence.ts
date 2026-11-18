import type { Client } from '../lib/hub.ts'
import { restartQuestionTimers } from '../lib/live.ts'

const pings = new Map<string, { at: number; url: string; events: string[] }>()

export function notePing(
  client: Client,
  ping: { browser: string; url: string; events: string[] }
) {
  client.browser = ping.browser
  client.usedAt = Date.now()
  pings.set(ping.browser, {
    at: Date.now(),
    url: ping.url,
    events: ping.events,
  })
  const url = new URL(ping.url)
  const sessionId = url.searchParams.get('session')
  if (ping.events.length > 0 && url.pathname === '/' && sessionId !== null) {
    restartQuestionTimers(sessionId)
  }
}

export function lastPing(browser: string) {
  return pings.get(browser)?.at ?? 0
}
