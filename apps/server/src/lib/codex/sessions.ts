import { existsSync } from 'node:fs'
import type { Item, ServerEvent } from '@offsite/core/protocol'
import { storedAccount } from '../../services/accounts.ts'
import { runs } from '../live.ts'
import { appServer, codexBaseDir, findCodex } from './app-server.ts'
import { turnItems, turnOf } from './items.ts'
import type { Thread, ThreadItem, ThreadStarted, Turn } from './types.ts'

function codexInstalled() {
  return findCodex() !== null && existsSync(codexBaseDir)
}

export async function codexThreads(paths: string[]) {
  if (paths.length === 0 || !codexInstalled()) return []
  const server = appServer(codexBaseDir)
  const threads: Thread[] = []
  let cursor: string | null = null
  do {
    const page: { data: Thread[]; nextCursor: string | null } =
      await server.request('thread/list', {
        cwd: paths,
        cursor,
        limit: 100,
        sortKey: 'updated_at',
        sourceKinds: ['cli', 'vscode', 'appServer'],
      })
    threads.push(...page.data)
    cursor = page.nextCursor
  } while (cursor !== null)
  return threads
}

export async function codexHistory(sessionId: string): Promise<ServerEvent> {
  const run = codexRun(sessionId)
  const thread = await readThread(sessionId)
  const items = turnItems(thread.turns, null)
  const ids = new Set(items.map((item) => item.id))
  return {
    type: 'history',
    sessionId,
    provider: 'codex',
    items: [
      ...items,
      ...[...(run?.items.values() ?? [])].filter((item) => !ids.has(item.id)),
    ],
    requests: [...(run?.pending.values() ?? [])].map((item) => item.request),
    queue: run?.queue ?? [],
    settings: run?.settings ?? null,
    context: run?.context ?? null,
    before: null,
    partial: run?.partial ?? '',
  }
}

export async function codexAgent(
  agentId: string,
  parent: string
): Promise<Item[]> {
  return turnItems((await readThread(agentId)).turns, parent)
}

export async function renameThread(sessionId: string, name: string) {
  await server(sessionId).request('thread/name/set', {
    threadId: sessionId,
    name,
  })
}

export async function deleteThread(sessionId: string) {
  await server(sessionId).request('thread/delete', { threadId: sessionId })
}

export async function forkThread(sessionId: string, messageId: string) {
  const result = await server(sessionId).request<ThreadStarted>('thread/fork', {
    threadId: sessionId,
    lastTurnId: turnOf(messageId),
    excludeTurns: true,
  })
  return { sessionId: result.thread.id }
}

export async function revertThread(sessionId: string, messageId: string) {
  await server(sessionId).request('thread/revert', {
    threadId: sessionId,
    beforeTurnId: turnOf(messageId),
  })
}

export async function codexCommitMessage(
  accountId: string | null,
  cwd: string,
  model: string,
  prompt: string
) {
  const server = appServer(storedAccount('codex', accountId).configDir)
  const started = await server.request<ThreadStarted>('thread/start', {
    cwd,
    model,
    ephemeral: true,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    developerInstructions: 'You write concise git commit messages.',
  })
  const threadId = started.thread.id
  const reply = Promise.withResolvers<string>()
  let text = ''
  server.threads.set(threadId, {
    notify: (method, params) => {
      if (method === 'item/completed') {
        const item = params.item as ThreadItem
        if (item.type === 'agentMessage') text = item.text
      }
      if (method !== 'turn/completed') return
      const turn = params.turn as Turn
      if (turn.status === 'completed') reply.resolve(text.trim())
      else reply.reject(new Error(turn.error?.message ?? 'Codex did not reply'))
    },
    request: (id, method) =>
      server.replyError(id, `offsite does not handle ${method}`),
    exited: () => reply.reject(new Error('Codex stopped')),
  })
  try {
    await server.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
      model,
    })
    return { message: await reply.promise }
  } finally {
    server.threads.delete(threadId)
    await server.request('thread/unsubscribe', { threadId })
  }
}

function codexRun(sessionId: string) {
  const run = runs.get(sessionId)
  return run?.provider === 'codex' ? run : undefined
}

function server(sessionId: string) {
  return codexRun(sessionId)?.server ?? appServer(codexBaseDir)
}

async function readThread(threadId: string) {
  const result = await server(threadId).request<{ thread: Thread }>(
    'thread/read',
    { threadId, includeTurns: true }
  )
  return result.thread
}
