import { randomUUID } from 'node:crypto'
import {
  type PermissionResult,
  type PermissionUpdate,
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { SessionSettings } from '@offsite/core/config'
import type { PermissionRequest, Prompt } from '@offsite/core/items'
import type { ContextUsage, TaskStatus } from '@offsite/core/sessions'
import {
  failQueued,
  markAccepted,
  queuedFor,
  removeFromOutbox,
  setOutboxStatus,
} from '../../services/outbox.ts'
import { publish } from '../hub.ts'
import {
  broadcastActivity,
  publishItems,
  runs,
  scheduleAutoResolve,
} from '../live.ts'
import { logger } from '../log.ts'
import { backgroundTasks } from './background-tasks.ts'
import { claudeEffort, claudeMode, runOptions } from './claude.ts'
import {
  contextTokens,
  type Message,
  notice,
  promptMessage,
  resultNotice,
  toMessage,
  turnFailed,
} from './content.ts'
import { toItems, toRequest } from './items.ts'
import { recordEventLimits } from './limits.ts'
import { permissionResult } from './permission.ts'
import { type Input, skillInputs } from './skills.ts'
import { followStart, followWorktree } from './worktree-follow.ts'

const IDLE_LIMIT = 10 * 60 * 1000

type Pending = {
  request: PermissionRequest
  input: Record<string, unknown>
  suggestions: PermissionUpdate[]
  resolve: (result: PermissionResult) => void
}

export class Run {
  readonly provider = 'claude'
  readonly sessionId: string
  readonly cwd: string
  readonly messages: Message[] = []
  readonly pending = new Map<string, Pending>()
  private readonly published = new Map<string, string>()
  readonly query: Query
  readonly closed: Promise<void>
  readonly resumeAt: string | null
  cut: string | null = null
  settings: SessionSettings
  context: ContextUsage | null = null
  partial = ''
  private model: string | null = null
  running = false
  prompted = false
  compacting = false
  backgroundTasks = 0
  backgroundAgents = 0
  agentTasks = 0
  failed = false
  tasks: Record<string, TaskStatus> = {}
  private readonly inbox: Input[] = []
  private readonly silent = new Set<string>()
  private readonly steering = new Map<string, { id: string; prompt: Prompt }>()
  private readonly worktreeTools = new Map<string, string>()
  private wake: (() => void) | null = null
  private idleTimer: NodeJS.Timeout | undefined
  private stopping = false

  constructor(options: {
    sessionId: string
    cwd: string
    resume: boolean
    resumeAt: string | null
    settings: SessionSettings
  }) {
    this.sessionId = options.sessionId
    this.cwd = options.cwd
    this.resumeAt = options.resumeAt
    this.settings = options.settings
    this.query = query({
      prompt: this.input(),
      options: {
        ...runOptions(options),
        canUseTool: (toolName, input, context) =>
          this.ask({
            toolName,
            input,
            title: context.title ?? null,
            suggestions: context.suggestions ?? [],
            signal: context.signal,
          }),
      },
    })
    runs.set(this.sessionId, this)
    this.closed = this.read()
  }

  submit(id: string, prompt: Prompt, delivery: 'queue' | 'steer') {
    if (!this.running) {
      this.push(prompt)
      removeFromOutbox(id)
      return
    }
    switch (delivery) {
      case 'steer': {
        const uuid = randomUUID()
        this.inbox.push({ prompt, uuid, priority: 'next' })
        this.wake?.()
        this.steering.set(uuid, { id, prompt })
        setOutboxStatus(id, 'sending')
        return
      }
      case 'queue':
        setOutboxStatus(id, 'queued')
    }
  }

  steer(id: string) {
    const item = queuedFor(this.sessionId).find((queued) => queued.id === id)
    if (item === undefined) {
      return
    }
    this.submit(id, item.prompt, 'steer')
  }

  async configure(settings: SessionSettings) {
    if (settings.model !== this.settings.model) {
      await this.query.setModel(settings.model ?? undefined)
    }
    if (settings.effort !== this.settings.effort) {
      await this.query.applyFlagSettings({
        effortLevel:
          settings.effort === null ? null : claudeEffort(settings.effort),
      })
    }
    if (settings.mode !== null && settings.mode !== this.settings.mode) {
      await this.query.setPermissionMode(claudeMode(settings.mode))
    }
    this.updateSettings({
      ...settings,
      accountId: this.settings.accountId,
      mode: settings.mode ?? this.settings.mode,
    })
  }

  async interrupt() {
    await this.query.interrupt()
  }

  async stopTask(taskId: string) {
    await this.query.stopTask(taskId)
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
    this.settle(
      requestId,
      permissionResult(pending.input, pending.suggestions, decision, answers)
    )
  }

  stop() {
    this.stopping = true
    runs.delete(this.sessionId)
    this.query.close()
  }

  private push(prompt: Prompt) {
    clearTimeout(this.idleTimer)
    const uuid = randomUUID()
    this.inbox.push({ prompt, uuid, priority: undefined })
    this.wake?.()
    this.add(promptMessage(prompt, uuid))
    this.running = true
    this.prompted = true
    broadcastActivity()
  }

  private publishContext() {
    publish(this.sessionId, {
      type: 'context',
      sessionId: this.sessionId,
      context: this.context,
    })
  }

  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = this.inbox.shift()
      if (next !== undefined) {
        yield* skillInputs(this.query, next, this.silent)
        const steered = this.steering.get(next.uuid)
        if (steered !== undefined) {
          markAccepted(steered.id)
        }
        continue
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }

  private async read() {
    try {
      for await (const message of this.query) {
        this.receive(message)
      }
    } catch (error) {
      if (!this.stopping) {
        logger.withTag('claude').warn(`${this.sessionId} failed:`, error)
        this.add(notice(error instanceof Error ? error.message : String(error)))
      }
    }
    clearTimeout(this.idleTimer)
    for (const id of this.pending.keys()) {
      this.settle(id, { behavior: 'deny', message: 'Session ended' })
    }
    if (runs.get(this.sessionId) === this) {
      runs.delete(this.sessionId)
    }
    this.running = false
    for (const steered of this.steering.values()) {
      setOutboxStatus(steered.id, 'failed')
    }
    failQueued(this.sessionId)
    broadcastActivity()
  }

  private receive(message: SDKMessage) {
    switch (message.type) {
      case 'assistant': {
        if (message.parent_tool_use_id === null) {
          this.partial = ''
          followWorktree(this.sessionId, this.cwd, this.worktreeTools, message)
        }
        this.add(toMessage('assistant', message, Date.now()))
        const tokens = contextTokens(message.message)
        if (message.parent_tool_use_id === null && tokens !== null) {
          this.model = message.message.model
          this.context = { tokens, window: this.context?.window ?? null }
        }
        if (message.error === 'rate_limit') {
          this.add(
            notice(
              'This account hit its usage limit. Pick another account below and send again.'
            )
          )
        }
        return
      }
      case 'user': {
        if ('isReplay' in message) {
          const steered = this.steering.get(message.uuid)
          if (steered === undefined) {
            return
          }
          this.steering.delete(message.uuid)
          this.add(promptMessage(steered.prompt, message.uuid))
          removeFromOutbox(steered.id)
          return
        }
        if (message.isSynthetic) {
          return
        }
        this.add(
          toMessage(
            'user',
            { ...message, uuid: message.uuid ?? randomUUID() },
            Date.now()
          )
        )
        followWorktree(this.sessionId, this.cwd, this.worktreeTools, message)
        return
      }
      case 'stream_event':
        if (
          message.parent_tool_use_id === null &&
          message.event.type === 'content_block_delta' &&
          message.event.delta.type === 'text_delta'
        ) {
          this.partial += message.event.delta.text
          publish(this.sessionId, {
            type: 'delta',
            sessionId: this.sessionId,
            text: message.event.delta.text,
          })
        }
        return
      case 'rate_limit_event':
        recordEventLimits(this.settings.accountId, message.rate_limit_info)
        return
      case 'result': {
        if (
          message.user_message_uuid !== undefined &&
          this.silent.delete(message.user_message_uuid)
        ) {
          return
        }
        const failure = resultNotice(message)
        if (failure !== null) {
          this.add(failure)
        }
        this.failed = turnFailed(message)
        this.finishTurn()
        const usage =
          this.model === null ? undefined : message.modelUsage[this.model]
        if (this.context !== null && usage !== undefined) {
          this.context = { ...this.context, window: usage.contextWindow }
        }
        this.publishContext()
        return
      }
      case 'system':
        switch (message.subtype) {
          case 'init':
            clearTimeout(this.idleTimer)
            if (!this.running) {
              this.prompted = false
            }
            this.running = true
            this.updateSettings({
              ...this.settings,
              mode: message.permissionMode,
            })
            void followStart(this.sessionId, this.cwd, message.cwd)
            return
          case 'background_tasks_changed': {
            const changed = backgroundTasks(message, this.tasks)
            this.agentTasks = changed.agentTasks
            this.backgroundTasks = changed.backgroundTasks
            this.backgroundAgents = changed.backgroundAgents
            this.tasks = changed.tasks
            broadcastActivity()
            this.armIdleTimer()
            return
          }
          case 'task_notification':
            if (message.ambient === true) {
              return
            }
            this.tasks = { ...this.tasks, [message.task_id]: message.status }
            broadcastActivity()
            return
          case 'status':
            if (this.compacting !== (message.status === 'compacting')) {
              this.compacting = message.status === 'compacting'
              broadcastActivity()
            }
            if (message.permissionMode !== undefined) {
              this.updateSettings({
                ...this.settings,
                mode: message.permissionMode,
              })
            }
            return
          case 'compact_boundary': {
            const tokens = message.compact_metadata.post_tokens
            this.context =
              tokens === undefined
                ? null
                : { tokens, window: this.context?.window ?? null }
            this.publishContext()
            this.add({
              type: 'compaction',
              uuid: message.uuid,
              time: Date.now(),
              summary: null,
            })
            return
          }
          case 'local_command_output':
            this.add({
              type: 'notice',
              uuid: message.uuid,
              time: Date.now(),
              text: message.content,
              isError: false,
            })
        }
    }
  }

  private finishTurn() {
    this.partial = ''
    this.compacting = false
    const next = queuedFor(this.sessionId).at(0)
    if (next !== undefined) {
      this.push(next.prompt)
      removeFromOutbox(next.id)
      return
    }
    this.running = false
    broadcastActivity()
    this.armIdleTimer()
  }

  private armIdleTimer() {
    clearTimeout(this.idleTimer)
    if (this.running || this.backgroundTasks > 0) {
      return
    }
    this.idleTimer = setTimeout(() => {
      if (!this.running && this.pending.size === 0) {
        this.stop()
      }
    }, IDLE_LIMIT)
  }

  private ask(options: {
    toolName: string
    input: Record<string, unknown>
    title: string | null
    suggestions: PermissionUpdate[]
    signal: AbortSignal
  }) {
    const request = scheduleAutoResolve(
      this.sessionId,
      toRequest({
        id: randomUUID(),
        toolName: options.toolName,
        input: options.input,
        title: options.title,
        canAlwaysAllow: options.suggestions.length > 0,
      })
    )
    return new Promise<PermissionResult>((resolve) => {
      this.pending.set(request.id, {
        request,
        input: options.input,
        suggestions: options.suggestions,
        resolve,
      })
      publish(this.sessionId, {
        type: 'request',
        sessionId: this.sessionId,
        request,
      })
      broadcastActivity()
      options.signal.addEventListener('abort', () =>
        this.settle(request.id, { behavior: 'deny', message: 'Cancelled' })
      )
    })
  }

  private settle(requestId: string, result: PermissionResult) {
    const pending = this.pending.get(requestId)
    if (pending === undefined) {
      return
    }
    this.pending.delete(requestId)
    pending.resolve(result)
    publish(this.sessionId, {
      type: 'requestDone',
      sessionId: this.sessionId,
      requestId,
    })
    broadcastActivity()
  }

  private add(message: Message) {
    if (this.messages.some((item) => item.uuid === message.uuid)) {
      return
    }
    this.messages.push(message)
    const items = toItems(this.messages).filter((item) => {
      const json = JSON.stringify(item)
      if (this.published.get(item.id) === json) {
        return false
      }
      this.published.set(item.id, json)
      return true
    })
    publishItems(this.sessionId, items)
  }

  private updateSettings(settings: SessionSettings) {
    this.settings = settings
    broadcastActivity()
    publish(this.sessionId, {
      type: 'settings',
      sessionId: this.sessionId,
      settings,
    })
  }
}
