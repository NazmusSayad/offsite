import { randomBytes } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { version } from '../../args.ts'
import { runs } from '../../lib/live.ts'
import { sessions } from '../sessions.ts'
import { busyTerminal, terminalTabs } from '../terminal/terminal.ts'

export const statusSecret = randomBytes(32).toString('base64url')

export async function busyReasons() {
  const reasons: string[] = []
  for (const tab of [...terminalTabs()]) {
    const result = await busyTerminal(tab.id)
    if ('error' in result) {
      reasons.push(`A terminal that might be busy: ${result.error}`)
    } else if (result.program !== null) {
      reasons.push(`Terminal running ${result.program}`)
    }
  }
  const titles = new Map(
    sessions().map((session) => [session.id, session.title])
  )
  for (const run of runs.values()) {
    const title = titles.get(run.sessionId)
    const thread =
      title === undefined ? `session ${run.sessionId}` : `"${title}"`
    if (run.running) {
      reasons.push(`Agent running in ${thread}`)
    }
    if (run.backgroundTasks > run.backgroundAgents) {
      reasons.push(`Background task running in ${thread}`)
    }
    if (run.backgroundAgents > 0) {
      reasons.push(`Background agent running in ${thread}`)
    }
  }
  return reasons
}

export async function answerStatus(response: ServerResponse) {
  const busy = await busyReasons()
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ version, busy }))
}
