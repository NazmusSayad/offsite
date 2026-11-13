import type { PermissionRequest } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import { watchActivity } from '../services/session-notices.ts'
import { readConfig } from '../storage/config.ts'
import type { Run } from './claude/index.ts'
import type { CodexRun } from './codex/index.ts'
import { broadcast } from './hub.ts'
import { logger } from './log.ts'
import type { OpenCodeRun } from './opencode/index.ts'

const log = logger.withTag('runs')

export type LiveRun = Run | CodexRun | OpenCodeRun

export const runs = new Map<string, LiveRun>()
export const titleJobs = new Set<string>()
let states = new Map<string, string>()

export function activity() {
  const result: Record<string, SessionActivity> = {}
  for (const run of runs.values()) {
    result[run.sessionId] = {
      running: run.running,
      waiting: run.pending.size > 0,
      approval: [...run.pending.values()].some(
        (pending) =>
          pending.request.kind === 'approval' || pending.request.kind === 'plan'
      ),
      question: [...run.pending.values()].some(
        (pending) => pending.request.kind === 'question'
      ),
      prompted: run.prompted,
      compacting: run.compacting,
      backgroundAgent: run.backgroundAgents > 0,
      holdsCompletion: !run.failed && run.agentTasks > 0,
      tasks: run.tasks,
    }
  }
  return result
}

export function broadcastActivity() {
  const next = new Map<string, string>()
  for (const run of runs.values()) {
    const state = [
      run.running ? 'running' : 'idle',
      ...(run.pending.size > 0 ? ['waiting for an answer'] : []),
      ...(run.compacting ? ['compacting'] : []),
    ].join(', ')
    next.set(run.sessionId, state)
    if (!states.has(run.sessionId)) {
      log.info(
        `${run.provider} session ${run.sessionId} opened in ${run.cwd} with account ${run.settings.accountId}`
      )
    }
    if (states.get(run.sessionId) !== state) {
      log.debug(`session ${run.sessionId} is ${state}`)
    }
  }
  for (const sessionId of states.keys()) {
    if (!next.has(sessionId)) {
      log.info(`session ${sessionId} closed`)
    }
  }
  states = next
  broadcast({ type: 'activity', activity: activity() })
  watchActivity()
}

export function scheduleAutoResolve(
  sessionId: string,
  request: PermissionRequest
): PermissionRequest {
  if (request.kind === 'plan') {
    return request
  }
  const config = readConfig()
  const run = runs.get(sessionId)
  const immediate =
    config.autoPermissionMode === 'bypass' &&
    ((run?.provider === 'claude' &&
      run.settings.mode === 'bypassPermissions') ||
      (run?.provider === 'codex' && run.settings.mode === 'full-access'))
  const seconds =
    request.kind === 'question'
      ? config.autoSkipQuestionTimeout
      : immediate
        ? 0
        : config.autoPermissionTimeout
  if (seconds === null) {
    return request
  }
  const decision =
    request.kind === 'question' || config.autoPermissionMode === 'bypass'
      ? 'allow'
      : config.autoPermissionMode
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
      log.warn(`could not auto-resolve ${request.id}:`, error)
    }
  }, seconds * 1000)
  return {
    ...request,
    autoResolve: { at: Date.now() + seconds * 1000, decision },
  }
}
