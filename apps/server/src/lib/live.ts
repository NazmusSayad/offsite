import type { PermissionRequest } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import { readConfig } from '../storage/config.ts'
import type { Run } from './claude/index.ts'
import type { CodexRun } from './codex/index.ts'
import { broadcast } from './hub.ts'
import type { OpenCodeRun } from './opencode/index.ts'

export const runs = new Map<string, Run | CodexRun | OpenCodeRun>()

export function activity() {
  const result: Record<string, SessionActivity> = {}
  for (const run of runs.values()) {
    result[run.sessionId] = {
      running: run.running,
      waiting: run.pending.size > 0,
      prompted: run.prompted,
      tasks: run.tasks,
    }
  }
  return result
}

export function broadcastActivity() {
  broadcast({ type: 'activity', activity: activity() })
}

export function scheduleAutoResolve(
  sessionId: string,
  request: PermissionRequest
): PermissionRequest {
  if (request.kind === 'plan') {
    return request
  }
  const config = readConfig()
  const seconds =
    request.kind === 'question'
      ? config.autoSkipQuestionTimeout
      : config.autoPermissionTimeout
  if (seconds === null) {
    return request
  }
  const decision =
    request.kind === 'question' ? 'allow' : config.autoPermissionMode
  setTimeout(async () => {
    const run = runs.get(sessionId)
    if (run === undefined) {
      return
    }
    try {
      await run.respond(
        request.id,
        decision,
        request.kind === 'question' ? {} : null
      )
    } catch (error) {
      console.warn(`could not auto-resolve ${request.id}: ${error}`)
    }
  }, seconds * 1000)
  return {
    ...request,
    autoResolve: { at: Date.now() + seconds * 1000, decision },
  }
}
