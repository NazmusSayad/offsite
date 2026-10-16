import { randomUUID } from 'node:crypto'
import {
  type PermissionResult,
  type PermissionUpdate,
  query,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import {
  claudeEffort,
  claudeMode,
  claudeOptions,
  recordLimit,
} from './claude.ts'
import { contextTokens, type Message, toMessage } from './content.ts'
import { broadcast, publish } from './hub.ts'
import { toItems, toRequest } from './items.ts'
import { broadcastActivity, runs } from './live.ts'
import type {
  Context,
  PermissionRequest,
  Prompt,
  Queued,
  Settings,
  TaskStatus,
} from './protocol.ts'

const IDLE_LIMIT = 10 * 60 * 1000
const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type Pending = {
  request: PermissionRequest
  input: Record<string, unknown>
  suggestions: PermissionUpdate[]
  resolve: (result: PermissionResult) => void
}

type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

export class Run {
  readonly provider = 'claude'
  readonly sessionId: string
  readonly messages: Message[] = []
  readonly pending = new Map<string, Pending>()
  private readonly published = new Map<string, string>()
  readonly query: Query
  readonly closed: Promise<void>
  readonly resumeAt: string | null
  queue: Queued[] = []
  settings: Settings
  context: Context | null = null
  partial = ''
  private model: string | null = null
  running = false
  prompted = false
  backgroundTasks = 0
  tasks: Record<string, TaskStatus> = {}
  private readonly inbox: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private idleTimer: NodeJS.Timeout | undefined
  private stopping = false

  constructor(options: {
    sessionId: string
    cwd: string
    resume: boolean
    resumeAt: string | null
    settings: Settings
  }) {
    this.sessionId = options.sessionId
    this.resumeAt = options.resumeAt
    this.settings = options.settings
    const settings = options.settings
    this.query = query({
      prompt: this.input(),
      options: {
        ...claudeOptions(settings.accountId, options.cwd),
        ...(options.resume
          ? { resume: options.sessionId }
          : { sessionId: options.sessionId }),
        ...(options.resumeAt === null
          ? {}
          : { resumeSessionAt: options.resumeAt }),
        enableFileCheckpointing: true,
        ...(settings.mode === null
          ? {}
          : { permissionMode: claudeMode(settings.mode) }),
        ...(settings.model === null ? {} : { model: settings.model }),
        ...(settings.effort === null
          ? {}
          : { effort: claudeEffort(settings.effort) }),
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
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

  submit(prompt: Prompt, delivery: 'queue' | 'steer') {
    if (!this.running) {
      this.push(prompt, undefined)
      return
    }
    switch (delivery) {
      case 'steer':
        this.push(prompt, 'next')
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
    this.submit(item.prompt, 'steer')
  }

  async configure(settings: Settings) {
    if (settings.model !== this.settings.model)
      await this.query.setModel(settings.model ?? undefined)
    if (settings.effort !== this.settings.effort)
      await this.query.applyFlagSettings({
        effortLevel:
          settings.effort === null ? null : claudeEffort(settings.effort),
      })
    if (settings.mode !== null && settings.mode !== this.settings.mode)
      await this.query.setPermissionMode(claudeMode(settings.mode))
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
    if (pending === undefined) return
    const input = pending.input
    switch (decision) {
      case 'allow':
        this.settle(requestId, {
          behavior: 'allow',
          updatedInput: answers === null ? input : { ...input, answers },
        })
        return
      case 'always':
        this.settle(requestId, {
          behavior: 'allow',
          updatedInput: input,
          updatedPermissions: pending.suggestions,
        })
        return
      case 'deny':
        this.settle(requestId, {
          behavior: 'deny',
          message: 'The user rejected this action',
          interrupt: true,
        })
    }
  }

  stop() {
    this.stopping = true
    runs.delete(this.sessionId)
    this.query.close()
  }

  private push(prompt: Prompt, priority: 'next' | undefined) {
    clearTimeout(this.idleTimer)
    for (const image of prompt.images)
      if (!imageTypes.includes(image.mediaType))
        throw new Error(`${image.mediaType} images are not supported`)
    const uuid = randomUUID()
    this.inbox.push({
      type: 'user',
      message: {
        role: 'user',
        content: [
          ...prompt.images.map((image) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: image.mediaType as ImageType,
              data: image.data,
            },
          })),
          ...(prompt.text === ''
            ? []
            : [{ type: 'text' as const, text: prompt.text }]),
        ],
      },
      parent_tool_use_id: null,
      uuid,
      ...(priority === undefined ? {} : { priority }),
    })
    this.wake?.()
    this.add({
      type: 'user',
      uuid,
      time: Date.now(),
      content: [
        ...prompt.images.map((image) => ({ type: 'image' as const, ...image })),
        ...(prompt.text === ''
          ? []
          : [{ type: 'text' as const, text: prompt.text }]),
      ],
      parent: null,
    })
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
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve
      })
    }
  }

  private async read() {
    try {
      for await (const message of this.query) this.receive(message)
    } catch (error) {
      if (!this.stopping)
        this.add(notice(error instanceof Error ? error.message : String(error)))
    }
    clearTimeout(this.idleTimer)
    for (const id of this.pending.keys())
      this.settle(id, { behavior: 'deny', message: 'Session ended' })
    if (runs.get(this.sessionId) === this) runs.delete(this.sessionId)
    this.running = false
    broadcastActivity()
  }

  private receive(message: SDKMessage) {
    switch (message.type) {
      case 'assistant': {
        if (message.parent_tool_use_id === null) this.partial = ''
        this.add(toMessage('assistant', message, Date.now()))
        const tokens = contextTokens(message.message)
        if (message.parent_tool_use_id === null && tokens !== null) {
          this.model = message.message.model
          this.context = { tokens, window: this.context?.window ?? null }
        }
        if (message.error === 'rate_limit')
          this.add(
            notice(
              'This account hit its usage limit. Pick another account below and send again.'
            )
          )
        return
      }
      case 'user':
        if (message.isSynthetic) return
        this.add(
          toMessage(
            'user',
            { ...message, uuid: message.uuid ?? randomUUID() },
            Date.now()
          )
        )
        return
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
      case 'rate_limit_event': {
        const accountId = this.settings.accountId
        if (accountId === null)
          throw new Error('Rate limit event for a run without an account')
        broadcast({
          type: 'limits',
          accountId,
          limits: recordLimit(accountId, message.rate_limit_info),
        })
        return
      }
      case 'result': {
        if (message.subtype !== 'success')
          this.add(notice(message.errors.join('\n') || message.subtype))
        this.finishTurn()
        const usage =
          this.model === null ? undefined : message.modelUsage[this.model]
        if (this.context !== null && usage !== undefined)
          this.context = { ...this.context, window: usage.contextWindow }
        this.publishContext()
        return
      }
      case 'system':
        switch (message.subtype) {
          case 'init':
            clearTimeout(this.idleTimer)
            if (!this.running) this.prompted = false
            this.running = true
            broadcastActivity()
            this.updateSettings({
              ...this.settings,
              mode: message.permissionMode,
            })
            return
          case 'background_tasks_changed': {
            const live = message.tasks.filter((task) => task.ambient !== true)
            this.backgroundTasks = live.length
            this.tasks = {
              ...Object.fromEntries(
                Object.entries(this.tasks).filter(
                  ([, status]) => status !== 'running'
                )
              ),
              ...Object.fromEntries(
                live.map((task) => [task.task_id, 'running' as const])
              ),
            }
            broadcastActivity()
            this.armIdleTimer()
            return
          }
          case 'task_notification':
            if (message.ambient === true) return
            this.tasks = { ...this.tasks, [message.task_id]: message.status }
            broadcastActivity()
            return
          case 'status':
            if (message.permissionMode !== undefined)
              this.updateSettings({
                ...this.settings,
                mode: message.permissionMode,
              })
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
    const [next, ...rest] = this.queue
    if (next !== undefined) {
      this.queue = rest
      this.publishQueue()
      this.push(next.prompt, undefined)
      return
    }
    this.running = false
    broadcastActivity()
    this.armIdleTimer()
  }

  private armIdleTimer() {
    clearTimeout(this.idleTimer)
    if (this.running || this.backgroundTasks > 0) return
    this.idleTimer = setTimeout(() => {
      if (!this.running && this.pending.size === 0) this.stop()
    }, IDLE_LIMIT)
  }

  private ask(options: {
    toolName: string
    input: Record<string, unknown>
    title: string | null
    suggestions: PermissionUpdate[]
    signal: AbortSignal
  }) {
    const request = toRequest({
      id: randomUUID(),
      toolName: options.toolName,
      input: options.input,
      title: options.title,
      canAlwaysAllow: options.suggestions.length > 0,
    })
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
    if (pending === undefined) return
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
    if (this.messages.some((item) => item.uuid === message.uuid)) return
    this.messages.push(message)
    const items = toItems(this.messages).filter((item) => {
      const json = JSON.stringify(item)
      if (this.published.get(item.id) === json) return false
      this.published.set(item.id, json)
      return true
    })
    if (items.length === 0) return
    publish(this.sessionId, {
      type: 'items',
      sessionId: this.sessionId,
      items,
    })
  }

  private updateSettings(settings: Settings) {
    this.settings = settings
    publish(this.sessionId, {
      type: 'settings',
      sessionId: this.sessionId,
      settings,
    })
  }

  private publishQueue() {
    publish(this.sessionId, {
      type: 'queue',
      sessionId: this.sessionId,
      queue: this.queue,
    })
  }
}

function notice(text: string): Message {
  return {
    type: 'notice',
    uuid: randomUUID(),
    time: Date.now(),
    text,
    isError: true,
  }
}
