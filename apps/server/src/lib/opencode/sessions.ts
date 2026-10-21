import type { SessionSettings } from '@offsite/core/config'
import type { Item } from '@offsite/core/items'
import type { ServerEvent } from '@offsite/core/protocol'
import type { ProviderCapabilities } from '@offsite/core/providers'
import type {
  ContextUsage,
  RewindRequest,
  RewindResult,
} from '@offsite/core/sessions'
import type {
  OpenCodeClient,
  SessionInfo,
  SessionMessageInfo,
} from '@opencode/client'
import { sumBy } from 'es-toolkit'
import { runs } from '../live.ts'
import { findOpenCode, openCode } from './client.ts'
import { messageItems } from './items.ts'

const PAGE = 100
const COMMIT_LIMIT = 2 * 60 * 1000

const temporary = new Set<string>()

export function openCodeInstalled() {
  return findOpenCode() !== null
}

export async function openCodeCapabilities(
  cwd: string
): Promise<ProviderCapabilities> {
  const client = await openCode()
  const location = { directory: cwd }
  const [models, commands, skills, agents] = await Promise.all([
    client.model.list({ location }),
    client.command.list({ location }),
    client.skill.list({ location }),
    client.agent.list({ location }),
  ])
  return {
    models: models.data
      .filter((model) => model.enabled)
      .map((model) => ({
        value: `${model.providerID}/${model.id}`,
        name: model.name,
        description: model.providerID,
        efforts: model.variants.map((variant) => variant.id),
      })),
    commands: [
      {
        name: 'compact',
        description: 'Summarize the conversation to free up context',
        hint: '',
      },
      ...[...commands.data, ...skills.data].map((command) => ({
        name: command.name,
        description: command.description ?? '',
        hint: '',
      })),
    ],
    agents: agents.data
      .filter((agent) => agent.mode !== 'subagent' && !agent.hidden)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? '',
      })),
  }
}

export async function openCodeSessions(paths: string[]) {
  if (paths.length === 0 || !openCodeInstalled()) {
    return []
  }
  const client = await openCode()
  const lists = await Promise.all(
    paths.map(async (directory) => {
      const found: SessionInfo[] = []
      let cursor: string | null = null
      do {
        const page = await client.session.list(
          cursor === null
            ? { directory, parentID: null, limit: PAGE }
            : { cursor }
        )
        found.push(...page.data)
        cursor = page.data.length === PAGE ? (page.cursor.next ?? null) : null
      } while (cursor !== null)
      return found
    })
  )
  return lists.flat().filter((session) => !temporary.has(session.id))
}

export async function openCodeSession(sessionId: string) {
  const client = await openCode()
  return client.session.get({ sessionID: sessionId })
}

export async function openCodeHistory(
  sessionId: string,
  cwd: string
): Promise<ServerEvent> {
  const run = openCodeRun(sessionId)
  const client = await openCode()
  const messages = await allMessages(client, sessionId)
  return {
    type: 'history',
    sessionId,
    provider: 'opencode',
    items: messages.flatMap((message) => messageItems(message, null)),
    requests: [...(run?.pending.values() ?? [])].map((item) => item.request),
    queue: run?.queue ?? [],
    settings: run?.settings ?? null,
    context: run?.context ?? (await contextOf(client, cwd, messages)),
    before: null,
    partial: run?.partial ?? '',
  }
}

export async function openCodeAgent(
  agentId: string,
  parent: string
): Promise<Item[]> {
  const messages = await allMessages(await openCode(), agentId)
  return messages.flatMap((message) => messageItems(message, parent))
}

export async function renameOpenCode(sessionId: string, title: string) {
  await (await openCode()).session.update({ sessionID: sessionId, title })
}

export async function removeOpenCode(sessionId: string) {
  await (await openCode()).session.remove({ sessionID: sessionId })
}

export async function forkOpenCode(sessionId: string, messageId: string) {
  const client = await openCode()
  const messages = await allMessages(client, sessionId)
  const index = messages.findIndex((message) => message.id === messageId)
  if (index < 0) {
    throw new Error('Cannot fork the session at that point')
  }
  const next = messages.at(index + 1)
  const result = await client.session.fork({
    sessionID: sessionId,
    ...(next === undefined ? {} : { before: next.id }),
  })
  return { sessionId: result.id }
}

export async function rewindOpenCode(
  request: RewindRequest
): Promise<RewindResult> {
  if (request.code && !request.conversation && !request.dryRun) {
    throw new Error('OpenCode restores files only with the conversation')
  }
  const client = await openCode()
  const sessionID = request.sessionId
  const staged = await client.session.revert.stage({
    sessionID,
    messageID: request.messageId,
    files: request.code,
  })
  const files = staged.files ?? []
  const result = request.code
    ? {
        files: files.map((file) => file.file),
        insertions: sumBy(files, (file) => file.additions),
        deletions: sumBy(files, (file) => file.deletions),
      }
    : null
  if (request.dryRun) {
    await client.session.revert.clear({ sessionID })
  } else {
    await client.session.revert.commit({ sessionID })
  }
  return result
}

export async function openCodeText(cwd: string, model: string, prompt: string) {
  const client = await openCode()
  const session = await client.session.create({
    location: { directory: cwd },
    agent: 'plan',
    model: modelRef(model, null),
  })
  temporary.add(session.id)
  try {
    await client.session.prompt({ sessionID: session.id, text: prompt })
    await client.session.wait(
      { sessionID: session.id },
      { signal: AbortSignal.timeout(COMMIT_LIMIT) }
    )
    const messages = await allMessages(client, session.id)
    for (const message of messages.toReversed()) {
      if (message.type === 'idle' && message.outcome === 'failed') {
        throw new Error(message.error?.message ?? 'OpenCode failed')
      }
      if (message.type !== 'assistant') {
        continue
      }
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('')
        .trim()
      if (text !== '') {
        return text
      }
    }
    throw new Error('OpenCode did not reply')
  } finally {
    await client.session.remove({ sessionID: session.id })
    temporary.delete(session.id)
  }
}

export async function contextOf(
  client: OpenCodeClient,
  cwd: string,
  messages: SessionMessageInfo[]
): Promise<ContextUsage | null> {
  const last = messages.findLast(
    (message) => message.type === 'assistant' && message.tokens !== undefined
  )
  if (last?.type !== 'assistant' || last.tokens === undefined) {
    return null
  }
  const tokens = last.tokens
  const models = await client.model.list({ location: { directory: cwd } })
  const model = models.data.find(
    (item) =>
      item.providerID === last.model.providerID && item.id === last.model.id
  )
  return {
    tokens:
      tokens.input +
      tokens.output +
      tokens.reasoning +
      tokens.cache.read +
      tokens.cache.write,
    window: model?.limit.context ?? null,
  }
}

export function modelRef(value: string, effort: string | null) {
  const index = value.indexOf('/')
  if (index < 0) {
    throw new Error(`${value} is not an OpenCode model`)
  }
  return {
    providerID: value.slice(0, index),
    id: value.slice(index + 1),
    ...(effort === null ? {} : { variant: effort }),
  }
}

async function allMessages(client: OpenCodeClient, sessionId: string) {
  const messages: SessionMessageInfo[] = []
  let cursor: string | null = null
  do {
    const page = await client.message.list(
      cursor === null
        ? { sessionID: sessionId, limit: PAGE, order: 'asc' }
        : { sessionID: sessionId, cursor }
    )
    messages.push(...page.data)
    cursor = page.data.length === PAGE ? (page.cursor.next ?? null) : null
  } while (cursor !== null)
  return messages
}

function openCodeRun(sessionId: string) {
  const run = runs.get(sessionId)
  return run?.provider === 'opencode' ? run : undefined
}

export function sessionSettings(
  session: SessionInfo,
  settings: SessionSettings
): SessionSettings {
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
