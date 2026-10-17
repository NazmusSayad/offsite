import { randomUUID } from 'node:crypto'
import type {
  Context,
  Item,
  PermissionRequest,
  Prompt,
  Queued,
  Settings,
  TaskStatus,
} from '@offsite/core/protocol'
import { storedAccount } from '../../services/accounts.ts'
import { publish } from '../hub.ts'
import { broadcastActivity, runs } from '../live.ts'
import { skills } from './accounts.ts'
import {
  type AppServer,
  appServer,
  type Params,
  type ThreadListener,
} from './app-server.ts'
import { errorItem, itemId, toItems } from './items.ts'
import { reply, toRequest } from './requests.ts'
import type { ThreadItem, ThreadStarted, Turn, UserInput } from './types.ts'

const IDLE_LIMIT = 30 * 60 * 1000

const presets = new Map([
  [
    'read-only',
    {
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    },
  ],
  [
    'auto',
    {
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    },
  ],
  [
    'full-access',
    {
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
    },
  ],
])

type Pending = {
  request: PermissionRequest
  id: number | string
  method: string
  params: Params
}

function codexServer(settings: Settings) {
  return appServer(storedAccount('codex', settings.accountId).configDir)
}

export class CodexRun implements ThreadListener {
  readonly provider = 'codex'
  readonly sessionId: string
  readonly cwd: string
  readonly server: AppServer
  readonly pending = new Map<string, Pending>()
  readonly items = new Map<string, Item>()
  readonly closed: Promise<void>
  queue: Queued[] = []
  settings: Settings
  context: Context | null = null
  partial = ''
  running = false
  prompted = false
  backgroundTasks = 0
  tasks: Record<string, TaskStatus> = {}
  activeAt = Date.now()
  private readonly model: string
  private readonly close: () => void
  private turnId: string | null = null
  private idleTimer: NodeJS.Timeout | undefined

  static async start(cwd: string, settings: Settings) {
    const server = codexServer(settings)
    const result = await server.request<ThreadStarted>('thread/start', {
      cwd,
      approvalsReviewer: 'user',
      ...(settings.model === null ? {} : { model: settings.model }),
      ...threadPreset(settings),
    })
    return new CodexRun(server, result.thread.id, cwd, result.model, settings)
  }

  static async resume(sessionId: string, cwd: string, settings: Settings) {
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
    settings: Settings
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

  async submit(prompt: Prompt, delivery: 'queue' | 'steer') {
    if (!this.running) {
      await this.startTurn(prompt)
      return
    }
    switch (delivery) {
      case 'steer':
        if (this.turnId === null) throw new Error('Codex has no turn to steer')
        await this.server.request('turn/steer', {
          threadId: this.sessionId,
          input: await this.input(prompt),
          expectedTurnId: this.turnId,
        })
        return
      case 'queue':
        this.queue = [...this.queue, { id: randomUUID(), prompt }]
        this.publishQueue()
    }
  }

  unqueue(id: string) {
    this.queue = this.queue.filter((item) => item.id !== id)
    this.publishQueue()
  }

  steer(id: string) {
    const item = this.queue.find((queued) => queued.id === id)
    if (item === undefined) return
    this.unqueue(id)
    this.submit(item.prompt, 'steer').catch((error: unknown) =>
      this.fail(error)
    )
  }

  configure(settings: Settings) {
    this.settings = { ...settings, accountId: this.settings.accountId }
    publish(this.sessionId, {
      type: 'settings',
      sessionId: this.sessionId,
      settings: this.settings,
    })
  }

  async interrupt() {
    if (this.turnId === null) return
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
    if (pending === undefined) return
    this.server.reply(
      pending.id,
      reply(pending.method, pending.params, decision, answers)
    )
    this.settle(requestId)
  }

  stop() {
    if (runs.get(this.sessionId) === this) runs.delete(this.sessionId)
    this.server.threads.delete(this.sessionId)
    clearTimeout(this.idleTimer)
    this.server
      .request('thread/unsubscribe', { threadId: this.sessionId })
      .catch((error: unknown) =>
        console.warn(`could not unload Codex thread: ${error}`)
      )
      .finally(() => this.end())
  }

  exited() {
    this.put(
      errorItem(
        randomUUID(),
        this.pending.size === 0
          ? 'Codex stopped'
          : 'Codex stopped, its open requests expired'
      )
    )
    if (runs.get(this.sessionId) === this) runs.delete(this.sessionId)
    this.end()
  }

  notify(method: string, params: Params) {
    this.activeAt = Date.now()
    switch (method) {
      case 'turn/started': {
        const turn = params.turn as Turn
        this.turnId = turn.id
        clearTimeout(this.idleTimer)
        if (!this.running) this.prompted = false
        this.running = true
        broadcastActivity()
        return
      }
      case 'turn/completed': {
        const turn = params.turn as Turn
        if (turn.status === 'failed' && turn.error !== null)
          this.put(errorItem(`${turn.id}:error`, turn.error.message))
        this.finishTurn()
        return
      }
      case 'item/started':
      case 'item/completed':
        for (const item of toItems(
          params.turnId as string,
          params.item as ThreadItem,
          null,
          Date.now()
        ))
          this.put(item)
        return
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
        if (item?.kind === 'command')
          this.put({ ...item, output: item.output + (params.delta as string) })
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
        if (params.willRetry !== true)
          this.put(errorItem(randomUUID(), error.message))
        return
      }
      case 'serverRequest/resolved':
        this.settle(String(params.requestId))
    }
  }

  request(id: number | string, method: string, params: Params) {
    if (method === 'mcpServer/elicitation/request') {
      this.server.reply(id, { action: 'decline', content: null, _meta: null })
      return
    }
    const request = toRequest(String(id), method, params, this.items)
    if (request === null) {
      this.server.replyError(id, `offsite does not handle ${method}`)
      return
    }
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
      ...prompt.images.map((image) => ({
        type: 'image' as const,
        url: `data:${image.mediaType};base64,${image.data}`,
      })),
    ]
  }

  private finishTurn() {
    this.partial = ''
    this.turnId = null
    const [next, ...rest] = this.queue
    if (next !== undefined) {
      this.queue = rest
      this.publishQueue()
      this.startTurn(next.prompt).catch((error: unknown) => this.fail(error))
      return
    }
    this.running = false
    broadcastActivity()
    this.armIdleTimer()
  }

  private settle(requestId: string) {
    if (!this.pending.delete(requestId)) return
    publish(this.sessionId, {
      type: 'requestDone',
      sessionId: this.sessionId,
      requestId,
    })
    broadcastActivity()
  }

  private put(item: Item) {
    this.items.set(item.id, item)
    publish(this.sessionId, {
      type: 'items',
      sessionId: this.sessionId,
      items: [item],
    })
  }

  private fail(error: unknown) {
    this.put(
      errorItem(
        randomUUID(),
        error instanceof Error ? error.message : String(error)
      )
    )
  }

  private armIdleTimer() {
    clearTimeout(this.idleTimer)
    if (this.running) return
    this.idleTimer = setTimeout(() => {
      if (!this.running && this.pending.size === 0) this.stop()
    }, IDLE_LIMIT)
  }

  private end() {
    clearTimeout(this.idleTimer)
    for (const requestId of [...this.pending.keys()]) this.settle(requestId)
    this.running = false
    broadcastActivity()
    this.close()
  }

  private publishQueue() {
    publish(this.sessionId, {
      type: 'queue',
      sessionId: this.sessionId,
      queue: this.queue,
    })
  }
}

function threadPreset(settings: Settings) {
  const preset = modePreset(settings.mode)
  if (preset === null) return {}
  return { approvalPolicy: preset.approvalPolicy, sandbox: preset.sandbox }
}

function modePreset(mode: string | null) {
  if (mode === null) return null
  const preset = presets.get(mode)
  if (preset === undefined) throw new Error(`Codex has no ${mode} mode`)
  return preset
}
