import { chosenAnswers } from '@offsite/core/answers'
import type { AnswerDraft, Item, PermissionRequest } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import { watchActivity } from '../services/session-notifications.ts'
import { readConfig } from '../storage/config.ts'
import type { Run } from './claude/index.ts'
import type { CodexRun } from './codex/index.ts'
import { broadcast, type Client, publish } from './hub.ts'
import { logger } from './log.ts'
import type { OpenCodeRun } from './opencode/index.ts'
import { forgetProgress, noteItems, progressOf } from './progress.ts'

const log = logger.withTag('runs')

export type LiveRun = Run | CodexRun | OpenCodeRun

export const runs = new Map<string, LiveRun>()
export const titleJobs = new Set<string>()
let states = new Map<string, string>()
const workingSince = new Map<string, number>()
let progressTimer: ReturnType<typeof setTimeout> | null = null

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
      backgroundAgents: run.backgroundAgents,
      holdsCompletion: holdsCompletion(run),
      tasks: run.tasks,
      settings: run.settings,
      workingSince: workingSince.get(run.sessionId) ?? null,
      requests: [...run.pending.values()].map((pending) => pending.request),
      context: run.context,
      agentModels: run.provider === 'claude' ? run.agentModels : {},
      modelNames: run.provider === 'claude' ? run.modelNames : {},
      ...progressOf(run.sessionId),
    }
  }
  return result
}

export function holdsCompletion(run: LiveRun) {
  return (
    !run.failed &&
    (run.agentTasks > 0 || (run.provider === 'claude' && run.finished.awaiting))
  )
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
    if (run.running && !workingSince.has(run.sessionId)) {
      workingSince.set(run.sessionId, Date.now())
    }
    if (!run.running) {
      workingSince.delete(run.sessionId)
    }
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
      workingSince.delete(sessionId)
      forgetProgress(sessionId)
    }
  }
  states = next
  broadcast({ type: 'activity', activity: activity() })
  watchActivity()
}

export function publishItems(sessionId: string, items: Item[]) {
  if (items.length === 0) {
    return
  }
  noteItems(sessionId, items)
  publish(sessionId, { type: 'items', sessionId, items })
  if (progressTimer === null) {
    progressTimer = setTimeout(() => {
      progressTimer = null
      broadcastActivity()
    }, 500)
  }
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
  waitForDeadline(sessionId, request.id, seconds * 1000)
  return {
    ...request,
    autoResolve: { at: Date.now() + seconds * 1000, decision },
  }
}

export function draftAnswers(
  sessionId: string,
  requestId: string,
  answers: AnswerDraft,
  sender: Client
) {
  const pending = runs.get(sessionId)?.pending.get(requestId)
  if (pending === undefined || pending.request.kind !== 'question') {
    return
  }
  pending.request = { ...pending.request, answers }
  publish(
    sessionId,
    { type: 'requestAnswers', sessionId, requestId, answers },
    sender
  )
  restartQuestionTimer(sessionId, requestId)
}

export function restartQuestionTimers(sessionId: string) {
  for (const requestId of runs.get(sessionId)?.pending.keys() ?? []) {
    restartQuestionTimer(sessionId, requestId)
  }
}

function restartQuestionTimer(sessionId: string, requestId: string) {
  const pending = runs.get(sessionId)?.pending.get(requestId)
  const seconds = readConfig().autoSkipQuestionTimeout
  if (
    pending === undefined ||
    pending.request.kind !== 'question' ||
    pending.request.autoResolve === undefined ||
    seconds === null
  ) {
    return
  }
  const at = Date.now() + seconds * 1000
  pending.request = {
    ...pending.request,
    autoResolve: { ...pending.request.autoResolve, at },
  }
  publish(sessionId, { type: 'requestDeadline', sessionId, requestId, at })
}

export function stopAutoResolve(sessionId: string, requestId: string) {
  const pending = runs.get(sessionId)?.pending.get(requestId)
  if (
    pending === undefined ||
    pending.request.kind !== 'question' ||
    pending.request.autoResolve === undefined
  ) {
    return
  }
  pending.request = { ...pending.request, autoResolve: undefined }
  publish(sessionId, {
    type: 'requestDeadline',
    sessionId,
    requestId,
    at: null,
  })
}

function waitForDeadline(sessionId: string, requestId: string, delay: number) {
  setTimeout(async () => {
    const run = runs.get(sessionId)
    const pending = run?.pending.get(requestId)
    if (
      run === undefined ||
      pending === undefined ||
      pending.request.autoResolve === undefined
    ) {
      return
    }
    const left = pending.request.autoResolve.at - Date.now()
    if (left > 0) {
      waitForDeadline(sessionId, requestId, left)
      return
    }
    const request = pending.request
    const decision = pending.request.autoResolve.decision
    pending.request = { ...request, autoResolve: undefined }
    try {
      await run.respond(requestId, decision, autoAnswers(request))
    } catch (error) {
      log.warn(`could not auto-resolve ${requestId}:`, error)
    }
  }, delay)
}

function autoAnswers(request: PermissionRequest) {
  if (request.kind !== 'question') {
    return null
  }
  if (request.answers === undefined) {
    return {}
  }
  return chosenAnswers(request.questions, request.answers)
}
