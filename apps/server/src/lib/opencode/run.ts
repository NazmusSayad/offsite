import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { PromptDelivery, SessionSettings } from '@offsite/core/config'
import type {
  PermissionDecision,
  Item,
  PermissionRequest,
  Prompt,
  QueuedPrompt,
} from '@offsite/core/items'
import type { ContextUsage, TaskStatus } from '@offsite/core/sessions'
import type {
  FormInfo,
  OpenCodeClient,
  PermissionReply,
  PermissionRequest as OpenCodePermission,
  V2Event,
} from '@opencode/client'
import { errorItem } from '../codex/index.ts'
import { publish } from '../hub.ts'
import { saveImage } from '../images.ts'
import { broadcastActivity, runs, scheduleAutoResolve } from '../live.ts'
import { openCode } from './client.ts'
import { formAnswer, formQuestions, messageItems } from './items.ts'
import { permissionRequest } from './requests.ts'
import { contextOf, modelRef, sessionSettings } from './sessions.ts'

const IDLE_LIMIT = 30 * 60 * 1000
const RECENT = 30

const replies: Record<PermissionDecision, PermissionReply> = {
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
  queue: QueuedPrompt[] = []
  settings: SessionSettings
  context: ContextUsage | null = null
  partial = ''
  running = false
  prompted = false
  compacting = false
  backgroundTasks = 0
  tasks: Record<string, TaskStatus> = {}
  private readonly close: () => void
  private applied: SessionSettings
  private loading = Promise.resolve()
  private refreshTimer: NodeJS.Timeout | undefined
  private idleTimer: NodeJS.Timeout | undefined

  static async start(cwd: string, settings: SessionSettings) {
    const client = await openCode()
    const session = await client.session.create({
      location: { directory: cwd },
      ...(settings.mode === null ? {} : { agent: settings.mode }),
      ...(settings.model === null
        ? {}
        : { model: modelRef(settings.model, settings.effort) }),
    })
    return new OpenCodeRun(session.id, cwd, settings, settings)
  }

  static async resume(
    sessionId: string,
    cwd: string,
    settings: SessionSettings
  ) {
    const client = await openCode()
    const session = await client.session.get({ sessionID: sessionId })
    return new OpenCodeRun(
      sessionId,
      cwd,
      settings,
      sessionSettings(session, settings)
    )
  }

  private constructor(
    sessionId: string,
    cwd: string,
    settings: SessionSettings,
    applied: SessionSettings
  ) {
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

  async submit(prompt: Prompt, delivery: PromptDelivery) {
    if (!this.running) {
      await this.startTurn(prompt)
      return
    }
    switch (delivery) {
      case 'steer':
        await (
          await openCode()
        ).session.prompt({
          sessionID: this.sessionId,
          text: prompt.text,
          files: await files(this.sessionId, prompt),
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
    if (item === undefined) {
      return
    }
    this.unqueue(id)
    this.submit(item.prompt, 'steer').catch((error: unknown) =>
      this.fail(error)
    )
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
    await (await openCode()).session.interrupt({ sessionID: this.sessionId })
  }

  stopTask(): Promise<void> {
    throw new Error('OpenCode has no background tasks to stop')
  }

  async respond(
    requestId: string,
    decision: PermissionDecision,
    answers: Record<string, string> | null
  ) {
    const pending = this.pending.get(requestId)
    if (pending === undefined) {
      return
    }
    const sessionID = this.sessionId
    const client = await openCode()
    if (pending.kind === 'permission') {
      await client.permission.reply({
        sessionID,
        requestID: requestId,
        decision: replies[decision],
      })
    } else if (decision === 'deny') {
      await client.session.form.cancel({ sessionID, formID: requestId })
    } else {
      await client.session.form.reply({
        sessionID,
        formID: requestId,
        answer: formAnswer(pending.form, answers ?? {}),
      })
    }
    this.settle(requestId)
  }

  stop() {
    if (runs.get(this.sessionId) === this) {
      runs.delete(this.sessionId)
    }
    this.end()
  }

  exited() {
    this.put([
      errorItem(
        randomUUID(),
        this.pending.size === 0
          ? 'Lost the connection to OpenCode'
          : 'Lost the connection to OpenCode, its open requests expired'
      ),
    ])
    this.stop()
  }

  reconcile(
    client: OpenCodeClient,
    active: boolean,
    permissions: OpenCodePermission[],
    forms: FormInfo[]
  ) {
    this.refresh(client)
    const open = new Set([
      ...permissions.map((permission) => permission.id),
      ...forms.map((form) => form.id),
    ])
    for (const requestId of [...this.pending.keys()]) {
      if (!open.has(requestId)) {
        this.settle(requestId)
      }
    }
    for (const permission of permissions) {
      if (!this.pending.has(permission.id)) {
        this.ask(permission)
      }
    }
    for (const form of forms) {
      if (!this.pending.has(form.id)) {
        this.askForm(form)
      }
    }
    if (this.running && !active) {
      this.finishTurn()
    }
  }

  receive(event: V2Event) {
    switch (event.type) {
      case 'session.reasoning.delta':
      case 'session.tool.input.delta':
      case 'session.compaction.delta':
        return
      case 'session.compaction.started':
        this.compacting = true
        broadcastActivity()
        return
      case 'session.compaction.ended':
      case 'session.compaction.failed':
        this.compacting = false
        broadcastActivity()
        this.refresh()
        return
      case 'session.execution.started':
        clearTimeout(this.idleTimer)
        if (!this.running) {
          this.prompted = false
        }
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
        this.askForm(event.data.form)
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

  private refresh(client?: OpenCodeClient) {
    clearTimeout(this.refreshTimer)
    this.loading = this.loading
      .then(async () => this.load(client ?? (await openCode())))
      .catch((error: unknown) =>
        console.warn(`could not load OpenCode messages: ${error}`)
      )
  }

  private async load(client: OpenCodeClient) {
    const page = await client.message.list({
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
    const context = await contextOf(client, this.cwd, messages)
    if (context === null || context.tokens === this.context?.tokens) {
      return
    }
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
    const client = await openCode()
    const sessionID = this.sessionId
    const location = { directory: this.cwd }
    const match = /^\/(\S+)\s*([\s\S]*)$/.exec(prompt.text)
    if (match !== null) {
      if (match[1] === 'compact' && prompt.images.length === 0) {
        await client.session.compact({ sessionID })
        return
      }
      const commands = await client.command.list({ location })
      if (commands.data.some((command) => command.name === match[1])) {
        await client.session.command({
          sessionID,
          name: match[1],
          text: match[2],
          files: await files(sessionID, prompt),
        })
        return
      }
      const skills = await client.skill.list({ location })
      const skill = skills.data.find((item) => item.name === match[1])
      if (skill !== undefined) {
        await client.session.prompt({
          sessionID,
          text: match[2],
          files: await files(sessionID, prompt),
          skills: [{ id: skill.id }],
        })
        return
      }
    }
    await client.session.prompt({
      sessionID,
      text: prompt.text,
      files: await files(sessionID, prompt),
    })
  }

  private async apply() {
    const client = await openCode()
    const settings = this.settings
    const model = settings.model ?? this.applied.model
    if (
      model !== null &&
      (model !== this.applied.model || settings.effort !== this.applied.effort)
    ) {
      await client.session.switchModel({
        sessionID: this.sessionId,
        model: modelRef(model, settings.effort),
      })
    }
    if (settings.mode !== null && settings.mode !== this.applied.mode) {
      await client.session.switchAgent({
        sessionID: this.sessionId,
        agent: settings.mode,
      })
    }
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
      request: permissionRequest(permission, item),
    })
  }

  private askForm(form: FormInfo) {
    this.addPending({
      kind: 'form',
      request: {
        id: form.id,
        kind: 'question',
        questions: formQuestions(form),
      },
      form,
    })
  }

  private addPending(pending: Pending) {
    const request = scheduleAutoResolve(this.sessionId, pending.request)
    this.pending.set(request.id, { ...pending, request })
    publish(this.sessionId, {
      type: 'request',
      sessionId: this.sessionId,
      request,
    })
    broadcastActivity()
  }

  private finishTurn() {
    this.partial = ''
    this.compacting = false
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

  private put(items: Item[]) {
    if (items.length === 0) {
      return
    }
    for (const item of items) {
      this.items.set(item.id, item)
    }
    if (items.some((item) => item.kind === 'assistant')) {
      this.partial = ''
    }
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
    if (this.running) {
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
    clearTimeout(this.refreshTimer)
    for (const requestId of [...this.pending.keys()]) {
      this.settle(requestId)
    }
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

function files(sessionId: string, prompt: Prompt) {
  return Promise.all(
    prompt.images.map(async (image) => ({
      uri: pathToFileURL(await saveImage(sessionId, image)).href,
    }))
  )
}
