import type { Activity } from '@offsite/core/protocol'
import type { Run } from './claude/index.ts'
import type { CodexRun } from './codex/index.ts'
import { broadcast } from './hub.ts'
import type { OpenCodeRun } from './opencode/index.ts'

export const runs = new Map<string, Run | CodexRun | OpenCodeRun>()

export function activity() {
  const result: Record<string, Activity> = {}
  for (const run of runs.values())
    result[run.sessionId] = {
      running: run.running,
      waiting: run.pending.size > 0,
      prompted: run.prompted,
      tasks: run.tasks,
    }
  return result
}

export function broadcastActivity() {
  broadcast({ type: 'activity', activity: activity() })
}
