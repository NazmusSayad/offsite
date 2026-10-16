import { randomUUID } from 'node:crypto'
import type {
  FormInfo,
  OpenCodeClient,
  PermissionReply,
  PermissionRequest as OpenCodePermission,
  SessionInfo,
  V2Event,
} from '@opencode/client'
import { errorItem } from '../codex/items.ts'
import { publish } from '../hub.ts'
import { broadcastActivity, runs } from '../live.ts'
import type {
  Context,
  Decision,
  Delivery,
  Item,
  PermissionRequest,
  Prompt,
  Queued,
  Settings,
  TaskStatus,
} from '../protocol.ts'
import { openCode } from './client.ts'
import { formAnswer, formQuestions, messageItems } from './items.ts'
import { contextOf, modelRef } from './sessions.ts'

const IDLE_LIMIT = 30 * 60 * 1000
const RECENT = 30

const replies: Record<Decision, PermissionReply> = {
  allow: 'once',
  always: 'always',
  deny: 'reject',
}

type Pending =
  | { kind: 'permission'; request: PermissionRequest }
  | { kind: 'form'; request: PermissionRequest; form: FormInfo }

export class OpenCodeRun {
  readonly provider = 'opencode'
  readonly sessionId: string
  readonly cwd: string
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
  private readonly client: OpenCodeClient
  private readonly close: () => void
  private applied: Settings
  private loading = Promise.resolve()
  private refreshTimer: NodeJS.Timeout | undefined
  private idleTimer: NodeJS.Timeout | undefined

  static async start(cwd: string, settings: Settings) {
    const client = await openCode()
    const session = await client.session.create({
      location: { directory: cwd },
      ...(settings.mode === null ? {} : { agent: settings.mode }),
      ...(settings.model === null
        ? {}
        : { model: modelRef(settings.model, settings.effort) }),
    })
    return new OpenCodeRun(client, session.id, cwd, settings, settings)
  }

  static async resume(sessionId: string, cwd: string, settings: Settings) {
    const client = await openCode()
    const session = await client.session.get({ sessionID: sessionId })
    return new OpenCodeRun(
      client,
      sessionId,
      cwd,
      settings,
      sessionSettings(session, settings)
    )
  }

  private constructor(
    client: OpenCodeClient,
    sessionId: string,
    cwd: string,
    settings: Settings,
    applied: Settings
  ) {
    this.client = client
    this.sessionId = sessionId
    this.cwd = cwd
    this.settings = settings
    this.applied = applied
    const closed = Promise.withResolvers<void>()
    this.closed = closed.promise
    this.close = closed.resolve
    runs.set(sessionId, this)
    this.armIdleTimer()
  }

  async submit(prompt: Prompt, delivery: Delivery) {
    if (!this.running) {
      await this.startTurn(prompt)
      return
    }
    switch (delivery) {
      case 'steer':
        await this.client.session.prompt({
          sessionID: this.sessionId,
          text: prompt.text,
          files: files(prompt),
          delivery: 'steer',
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
    await this.client.session.interrupt({ sessionID: this.sessionId })
  }

  stopTask(): Promise<void> {
    throw new Error('OpenCode has no background tasks to stop')
  }

  async respond(
    requestId: string,
    decision: Decision,
    answers: Record<string, string> | null
  ) {
    const pending = this.pending.get(requestId)
    if (pending === undefined) return
    const sessionID = this.sessionId
    if (pending.kind === 'permission')
      await this.client.permission.reply({
        sessionID,
        requestID: requestId,
        decision: replies[decision],
      })
    else if (decision === 'deny')
      await this.client.session.form.cancel({ sessionID, formID: requestId })
    else
      await this.client.session.form.reply({
        sessionID,
        formID: requestId,
        answer: formAnswer(pending.form, answers ?? {}),
      })
    this.settle(requestId)
  }

  stop() {
    if (runs.get(this.sessionId) === this) runs.delete(this.sessionId)
    this.end()
  }

  exited() {
    this.put([errorItem(randomUUID(), 'Lost the connection to OpenCode')])
    this.stop()
  }

  resync(active: boolean) {
    this.refresh()
    if (this.running && !active) this.finishTurn()
  }

  receive(event: V2Event) {
    switch (event.type) {
      case 'session.reasoning.delta':
      case 'session.tool.input.delta':
      case 'session.compaction.delta':
        return
      case 'session.execution.started':
        clearTimeout(this.idleTimer)
        if (!this.running) this.prompted = false
        this.running = true
        broadcastActivity()
        return
      case 'session.execution.succeeded':
      case 'session.execution.failed':
      case 'session.execution.interrupted':
        this.refresh()
        void this.loading.then(() => this.finishTurn())
        return
      case 'session.text.delta':
        this.partial += event.data.delta
        publish(this.sessionId, {
          type: 'delta',
          sessionId: this.sessionId,
          text: event.data.delta,
        })
        return
      case 'permission.asked':
        this.refresh()
        void this.loading.then(() => this.ask(event.data))
        return
      case 'permission.replied':
        this.settle(event.data.requestID)
        return
      case 'form.created':
        this.addPending({
          kind: 'form',
          request: {
            id: event.data.form.id,
            kind: 'question',
            questions: formQuestions(event.data.form),
          },
          form: event.data.form,
        })
        return
      case 'form.replied':
      case 'form.cancelled':
        this.settle(event.data.id)
        return
      default:
        clearTimeout(this.refreshTimer)
        this.refreshTimer = setTimeout(() => this.refresh(), 100)
    }
  }

  private refresh() {
    clearTimeout(this.refreshTimer)
    this.loading = this.loading
      .then(() => this.load())
      .catch((error: unknown) =>
        console.warn(`could not load OpenCode messages: ${error}`)
      )
  }

  private async load() {
    const page = await this.client.message.list({
      sessionID: this.sessionId,
      limit: RECENT,
      order: 'desc',
    })
    const messages = page.data.toReversed()
    this.put(
      messages
        .flatMap((message) => messageItems(message, null))
        .filter(
          (item) =>
            JSON.stringify(this.items.get(item.id)) !== JSON.stringify(item)
        )
    )
    const context = await contextOf(this.client, this.cwd, messages)
    if (context === null || context.tokens === this.context?.tokens) return
    this.context = context
    publish(this.sessionId, {
      type: 'context',
      sessionId: this.sessionId,
      context,
    })
  }

  private async startTurn(prompt: Prompt) {
    clearTimeout(this.idleTimer)
    this.running = true
    this.prompted = true
    broadcastActivity()
    try {
      await this.apply()
      await this.send(prompt)
    } catch (error) {
      this.running = false
      broadcastActivity()
      this.armIdleTimer()
      throw error
    }
  }

  private async send(prompt: Prompt) {
    const sessionID = this.sessionId
    const location = { directory: this.cwd }
    const match = /^\/(\S+)\s*([\s\S]*)$/.exec(prompt.text)
    if (match !== null) {
      if (match[1] === 'compact' && prompt.images.length === 0) {
        await this.client.session.compact({ sessionID })
        return
      }
      const commands = await this.client.command.list({ location })
      if (commands.data.some((command) => command.name === match[1])) {
        await this.client.session.command({
          sessionID,
          name: match[1],
          text: match[2],
          files: files(prompt),
        })
        return
      }
      const skills = await this.client.skill.list({ location })
      const skill = skills.data.find((item) => item.name === match[1])
      if (skill !== undefined) {
        await this.client.session.prompt({
          sessionID,
          text: match[2],
          files: files(prompt),
          skills: [{ id: skill.id }],
        })
        return
      }
    }
    await this.client.session.prompt({
      sessionID,
      text: prompt.text,
      files: files(prompt),
    })
  }

  private async apply() {
    const settings = this.settings
    const model = settings.model ?? this.applied.model
    if (
      model !== null &&
      (model !== this.applied.model || settings.effort !== this.applied.effort)
    )
      await this.client.session.switchModel({
        sessionID: this.sessionId,
        model: modelRef(model, settings.effort),
      })
    if (settings.mode !== null && settings.mode !== this.applied.mode)
      await this.client.session.switchAgent({
        sessionID: this.sessionId,
        agent: settings.mode,
      })
    this.applied = {
      ...settings,
      model,
      mode: settings.mode ?? this.applied.mode,
    }
  }

  private ask(permission: OpenCodePermission) {
    const source = permission.source
    const item =
      source === undefined
        ? undefined
        : this.items.get(`${source.messageID}:${source.id}`)
    this.addPending({
      kind: 'permission',
      request: {
        id: permission.id,
        kind: 'approval',
        title:
          permission.message ??
          `Allow ${permission.action} ${permission.resources.join(', ')}?`,
        canAlwaysAllow: (permission.save ?? []).length > 0,
        item: item ?? {
          id: permission.id,
          parent: null,
          time: Date.now(),
          kind: 'tool',
          name: permission.action,
          input: { resources: permission.resources },
          output: '',
          status: 'running',
        },
      },
    })
  }

  private addPending(pending: Pending) {
    this.pending.set(pending.request.id, pending)
    publish(this.sessionId, {
      type: 'request',
      sessionId: this.sessionId,
      request: pending.request,
    })
    broadcastActivity()
  }

  private finishTurn() {
    this.partial = ''
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

  private put(items: Item[]) {
    if (items.length === 0) return
    for (const item of items) this.items.set(item.id, item)
    if (items.some((item) => item.kind === 'assistant')) this.partial = ''
    publish(this.sessionId, {
      type: 'items',
      sessionId: this.sessionId,
      items,
    })
  }

  private fail(error: unknown) {
    this.put([
      errorItem(
        randomUUID(),
        error instanceof Error ? error.message : String(error)
      ),
    ])
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
    clearTimeout(this.refreshTimer)
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

function sessionSettings(session: SessionInfo, settings: Settings): Settings {
  const variant = session.model?.variant
  return {
    ...settings,
    model:
      session.model === undefined
        ? null
        : `${session.model.providerID}/${session.model.id}`,
    effort: variant === undefined || variant === 'default' ? null : variant,
    mode: session.agent ?? null,
  }
}

function files(prompt: Prompt) {
  return prompt.images.map((image) => ({
    uri: `data:${image.mediaType};base64,${image.data}`,
  }))
}
