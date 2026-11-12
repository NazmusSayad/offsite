import { randomUUID } from 'node:crypto'
import type { SessionSettings } from '@offsite/core/config'
import type { Item, PermissionRequest, Prompt } from '@offsite/core/items'
import type { ContextUsage, TaskStatus } from '@offsite/core/sessions'
import { storedAccount } from '../../services/accounts.ts'
import {
  failQueued,
  queuedFor,
  Handover,
  setUnsentStatus,
} from '../../services/unsent.ts'
import { publish } from '../hub.ts'
import { broadcastActivity, runs, scheduleAutoResolve } from '../live.ts'
import { logger } from '../log.ts'
import { skills } from './accounts.ts'
import { trackAgents } from './agents.ts'
import {
  type AppServer,
  appServer,
  codexBaseDir,
  type Params,
  type ThreadListener,
} from './app-server.ts'
import { errorItem, imageInputs, itemId, taskStatus, toItems } from './items.ts'
import { modePreset, threadPreset } from './presets.ts'
import { reply, toRequest } from './requests.ts'
import type { ThreadItem, ThreadStarted, Turn, UserInput } from './types.ts'

const log = logger.withTag('codex')

const IDLE_LIMIT = 30 * 60 * 1000

type Pending = {
  request: PermissionRequest
  id: number | string
  method: string
  params: Params
}

function codexServer(settings: SessionSettings) {
  return appServer(
    storedAccount('codex', settings.accountId).configDir ?? codexBaseDir
  )
}

export class CodexRun implements ThreadListener {
  readonly provider = 'codex'
  readonly sessionId: string
  readonly cwd: string
  readonly server: AppServer
  readonly pending = new Map<string, Pending>()
  readonly items = new Map<string, Item>()
  readonly closed: Promise<void>
  settings: SessionSettings
  context: ContextUsage | null = null
  partial = ''
  running = false
  prompted = false
  compacting = false
  backgroundTasks = 0
  backgroundAgents = 0
  failed = false
  tasks: Record<string, TaskStatus> = {}
  activeAt = Date.now()
  private readonly model: string
  private readonly close: () => void
  private turnId: string | null = null
  private readonly agents = new Map<string, boolean>()
  private readonly handover = new Handover()
  private idleTimer: NodeJS.Timeout | undefined

  static async start(cwd: string, settings: SessionSettings) {
    const server = codexServer(settings)
    const result = await server.request<ThreadStarted>('thread/start', {
      cwd,
      approvalsReviewer: 'user',
      ...(settings.model === null ? {} : { model: settings.model }),
      ...threadPreset(settings),
    })
    return new CodexRun(server, result.thread.id, cwd, result.model, settings)
  }

  static async resume(
    sessionId: string,
    cwd: string,
    settings: SessionSettings
  ) {
    const server = codexServer(settings)
    const result = await server.request<ThreadStarted>('thread/resume', {
      threadId: sessionId,
      approvalsReviewer: 'user',
      excludeTurns: true,
      ...(settings.model === null ? {} : { model: settings.model }),
      ...threadPreset(settings),
    })
    return new CodexRun(server, sessionId, cwd, result.model, settings)
  }

  private constructor(
    server: AppServer,
    sessionId: string,
    cwd: string,
    model: string,
    settings: SessionSettings
  ) {
    this.server = server
    this.sessionId = sessionId
    this.cwd = cwd
    this.model = model
    this.settings = settings
    const closed = Promise.withResolvers<void>()
    this.closed = closed.promise
    this.close = closed.resolve
    server.threads.set(sessionId, this)
    runs.set(sessionId, this)
    this.armIdleTimer()
  }

  async submit(id: string, prompt: Prompt, delivery: 'queue' | 'steer') {
    if (!this.running) {
      await this.handover.hand(id, () => this.startTurn(prompt))
      return
    }
    switch (delivery) {
      case 'steer': {
        const turnId = this.turnId
        if (turnId === null) {
          throw new Error('Codex has no turn to steer')
        }
        await this.handover.hand(id, async () =>
          this.server.request('turn/steer', {
            threadId: this.sessionId,
            input: await this.input(prompt),
            expectedTurnId: turnId,
          })
        )
        return
      }
      case 'queue':
        setUnsentStatus(id, 'queued')
    }
  }

  steer(id: string) {
    const item = queuedFor(this.sessionId).find((queued) => queued.id === id)
    if (item === undefined) {
      return
    }
    setUnsentStatus(id, 'sending')
    this.submit(id, item.prompt, 'steer').catch((error: unknown) => {
      this.fail(error)
      setUnsentStatus(id, 'failed')
    })
  }

  configure(settings: SessionSettings) {
    this.settings = { ...settings, accountId: this.settings.accountId }
    publish(this.sessionId, {
      type: 'settings',
      sessionId: this.sessionId,
      settings: this.settings,
    })
  }

  async interrupt() {
    if (this.turnId === null) {
      return
    }
    await this.server.request('turn/interrupt', {
      threadId: this.sessionId,
      turnId: this.turnId,
    })
  }

  stopTask(): Promise<void> {
    throw new Error('Codex has no background tasks to stop')
  }

  respond(
    requestId: string,
    decision: 'allow' | 'always' | 'deny',
    answers: Record<string, string> | null
  ) {
    const pending = this.pending.get(requestId)
    if (pending === undefined) {
      return
    }
    this.server.reply(
      pending.id,
      reply(pending.method, pending.params, decision, answers)
    )
    this.settle(requestId)
  }

  stop() {
    if (runs.get(this.sessionId) === this) {
      runs.delete(this.sessionId)
    }
    this.server.threads.delete(this.sessionId)
    clearTimeout(this.idleTimer)
    this.server
      .request('thread/unsubscribe', { threadId: this.sessionId })
      .catch((error: unknown) =>
        log.warn(`could not unload Codex thread:`, error)
      )
      .finally(() => this.end())
  }

  exited() {
    log.warn(`session ${this.sessionId} lost its Codex app server`)
    this.put(
      errorItem(
        randomUUID(),
        this.pending.size === 0
          ? 'Codex stopped'
          : 'Codex stopped, its open requests expired'
      )
    )
    if (runs.get(this.sessionId) === this) {
      runs.delete(this.sessionId)
    }
    this.end()
  }

  notify(method: string, params: Params) {
    this.activeAt = Date.now()
    this.notifyAgent(method, params)
    switch (method) {
      case 'turn/started': {
        const turn = params.turn as Turn
        this.turnId = turn.id
        clearTimeout(this.idleTimer)
        if (!this.running) {
          this.prompted = false
        }
        this.running = true
        broadcastActivity()
        return
      }
      case 'turn/completed': {
        const turn = params.turn as Turn
        if (turn.status === 'failed' && turn.error !== null) {
          this.put(errorItem(`${turn.id}:error`, turn.error.message))
        }
        this.failed = turn.status === 'failed' || turn.status === 'inProgress'
        this.finishTurn()
        return
      }
      case 'item/started':
      case 'item/completed': {
        const thread = params.item as ThreadItem
        if (thread.type === 'contextCompaction') {
          this.compacting = method === 'item/started'
          broadcastActivity()
          if (this.compacting) {
            return
          }
        }
        if (thread.type === 'commandExecution') {
          this.tasks = { ...this.tasks, [thread.id]: taskStatus(thread.status) }
          broadcastActivity()
          this.armIdleTimer()
        }
        for (const item of toItems(
          params.turnId as string,
          thread,
          null,
          Date.now()
        )) {
          this.put(item)
        }
        return
      }
      case 'item/agentMessage/delta':
        this.partial += params.delta as string
        publish(this.sessionId, {
          type: 'delta',
          sessionId: this.sessionId,
          text: params.delta as string,
        })
        return
      case 'item/commandExecution/outputDelta': {
        const item = this.items.get(
          itemId(params.turnId as string, params.itemId as string)
        )
        if (item?.kind === 'command') {
          this.put({ ...item, output: item.output + (params.delta as string) })
        }
        return
      }
      case 'turn/plan/updated': {
        const plan = params.plan as {
          step: string
          status: 'pending' | 'inProgress' | 'completed'
        }[]
        this.put({
          id: `${params.turnId as string}:plan`,
          parent: null,
          time: Date.now(),
          kind: 'todo_list',
          steps: plan.map((step) => ({
            text: step.step,
            status: step.status === 'inProgress' ? 'running' : step.status,
          })),
        })
        return
      }
      case 'thread/tokenUsage/updated': {
        const usage = params.tokenUsage as {
          last: { totalTokens: number }
          modelContextWindow: number | null
        }
        this.context = {
          tokens: usage.last.totalTokens,
          window: usage.modelContextWindow,
        }
        publish(this.sessionId, {
          type: 'context',
          sessionId: this.sessionId,
          context: this.context,
        })
        return
      }
      case 'error': {
        const error = params.error as { message: string }
        if (params.willRetry !== true) {
          this.put(errorItem(randomUUID(), error.message))
        }
        return
      }
      case 'serverRequest/resolved':
        this.settle(String(params.requestId))
    }
  }

  notifyAgent(method: string, params: Params) {
    const running = this.agentTasks
    trackAgents(this.agents, method, params)
    if (this.agentTasks !== running) {
      broadcastActivity()
    }
  }

  get agentTasks() {
    return [...this.agents.values()].filter((running) => running).length
  }

  request(id: number | string, method: string, params: Params) {
    if (method === 'mcpServer/elicitation/request') {
      this.server.reply(id, { action: 'decline', content: null, _meta: null })
      return
    }
    const created = toRequest(String(id), method, params, this.items)
    if (created === null) {
      this.server.replyError(id, `offsite does not handle ${method}`)
      return
    }
    const request = scheduleAutoResolve(this.sessionId, created)
    this.pending.set(request.id, { request, id, method, params })
    publish(this.sessionId, {
      type: 'request',
      sessionId: this.sessionId,
      request,
    })
    broadcastActivity()
  }

  private async startTurn(prompt: Prompt) {
    clearTimeout(this.idleTimer)
    this.running = true
    this.prompted = true
    broadcastActivity()
    try {
      if (prompt.text.trim() === '/compact' && prompt.images.length === 0) {
        await this.server.request('thread/compact/start', {
          threadId: this.sessionId,
        })
        return
      }
      const model = this.settings.model ?? this.model
      const preset = modePreset(this.settings.mode)
      const result = await this.server.request<{ turn: Turn }>('turn/start', {
        threadId: this.sessionId,
        input: await this.input(prompt),
        model,
        approvalsReviewer: 'user',
        summary: 'detailed',
        ...(this.settings.effort === null
          ? {}
          : { effort: this.settings.effort }),
        ...(preset === null
          ? {}
          : {
              approvalPolicy: preset.approvalPolicy,
              sandboxPolicy: preset.sandboxPolicy,
            }),
        collaborationMode: {
          mode: this.settings.plan ? 'plan' : 'default',
          settings: {
            model,
            reasoning_effort: this.settings.effort,
            developer_instructions: null,
          },
        },
      })
      this.turnId = result.turn.id
    } catch (error) {
      this.running = false
      broadcastActivity()
      this.armIdleTimer()
      throw error
    }
  }

  private async input(prompt: Prompt): Promise<UserInput[]> {
    const match = /^\/(\S+)\s*([\s\S]*)$/.exec(prompt.text)
    const skill =
      match === null
        ? undefined
        : (await skills(this.server, this.cwd)).find(
            (item) => item.name === match[1]
          )
    const text = skill === undefined || match === null ? prompt.text : match[2]
    return [
      ...(skill === undefined
        ? []
        : [{ type: 'skill' as const, name: skill.name, path: skill.path }]),
      ...(text === ''
        ? []
        : [{ type: 'text' as const, text, text_elements: [] as [] }]),
      ...(await imageInputs(this.sessionId, prompt.images)),
    ]
  }

  private finishTurn() {
    this.partial = ''
    this.compacting = false
    this.turnId = null
    this.handover.confirmAll()
    const next = queuedFor(this.sessionId).at(0)
    if (next !== undefined) {
      this.handover
        .hand(next.id, () => this.startTurn(next.prompt))
        .catch((error: unknown) => {
          this.fail(error)
          setUnsentStatus(next.id, 'failed')
        })
      return
    }
    this.running = false
    broadcastActivity()
    this.armIdleTimer()
  }

  private settle(requestId: string) {
    if (!this.pending.delete(requestId)) {
      return
    }
    publish(this.sessionId, {
      type: 'requestDone',
      sessionId: this.sessionId,
      requestId,
    })
    broadcastActivity()
  }

  private put(item: Item) {
    const arrived =
      item.kind === 'user' && item.parent === null && !this.items.has(item.id)
    this.items.set(item.id, item)
    publish(this.sessionId, {
      type: 'items',
      sessionId: this.sessionId,
      items: [item],
    })
    if (arrived) {
      this.handover.confirm(1)
    }
  }

  private fail(error: unknown) {
    log.warn(`session ${this.sessionId} failed:`, error)
    this.put(
      errorItem(
        randomUUID(),
        error instanceof Error ? error.message : String(error)
      )
    )
  }

  private armIdleTimer() {
    clearTimeout(this.idleTimer)
    if (this.running || Object.values(this.tasks).includes('running')) {
      return
    }
    this.idleTimer = setTimeout(() => {
      if (!this.running && this.pending.size === 0) {
        this.stop()
      }
    }, IDLE_LIMIT)
  }

  private end() {
    clearTimeout(this.idleTimer)
    for (const requestId of [...this.pending.keys()]) {
      this.settle(requestId)
    }
    this.running = false
    this.handover.confirmAll()
    failQueued(this.sessionId)
    broadcastActivity()
    this.close()
  }
}
