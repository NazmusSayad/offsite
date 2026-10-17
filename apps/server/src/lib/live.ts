import type { Activity, PermissionRequest } from '@offsite/core/protocol'
import { readConfig } from '../storage/config.ts'
import type { Run } from './claude/index.ts'
import type { CodexRun } from './codex/index.ts'
import { broadcast } from './hub.ts'
import type { OpenCodeRun } from './opencode/index.ts'

export const runs = new Map<string, Run | CodexRun | OpenCodeRun>()

export function activity() {
  const result: Record<string, Activity> = {}
  for (const run of runs.values())
    {result[run.sessionId] = {
      running: run.running,
      waiting: run.pending.size > 0,
      prompted: run.prompted,
      tasks: run.tasks,
    }}
  return result
}

export function broadcastActivity() {
  broadcast({ type: 'activity', activity: activity() })
}

export function scheduleAutoResolve(
  sessionId: string,
  request: PermissionRequest
) {
  if (request.kind === 'plan') {return}
  const settings = readConfig().autoResolve
  const minutes =
    request.kind === 'question' ? settings.questions : settings.permissions
  if (minutes === null) {return}
  setTimeout(async () => {
    const run = runs.get(sessionId)
    if (run === undefined) {return}
    try {
      if (request.kind === 'question')
        {await run.respond(request.id, 'allow', {})}
      else
        {await run.respond(
          request.id,
          readConfig().autoResolve.permissionDecision,
          null
        )}
    } catch (error) {
      console.warn(`could not auto-resolve ${request.id}: ${error}`)
    }
  }, minutes * 60_000)
}
