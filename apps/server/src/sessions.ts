import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import {
  deleteSession,
  forkSession,
  getSessionMessages,
  listSessions,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import { codexBaseDir } from './codex/app-server.ts'
import {
  codexThreads,
  deleteThread,
  forkThread,
  renameThread,
} from './codex/sessions.ts'
import { readConfig } from './config.ts'
import { db } from './db.ts'
import { broadcast } from './hub.ts'
import { runs } from './live.ts'
import {
  forkOpenCode,
  openCodeSessions,
  removeOpenCode,
  renameOpenCode,
} from './opencode/sessions.ts'
import { projects } from './projects.ts'
import type { Provider, Session, SessionPatch } from './protocol.ts'

const day = 24 * 60 * 60 * 1000

const providers = new Map<string, Provider>()
let watchers: FSWatcher[] = []
let timer: NodeJS.Timeout | undefined

export async function sessions(): Promise<Session[]> {
  const records = readRecords()
  const paths = projects().map((project) => project.path)
  const [claude, codex, opencode] = await Promise.all([
    Promise.all(
      paths.map(async (cwd) =>
        (
          await listSessions({
            dir: cwd,
            includeWorktrees: false,
            includeProgrammatic: false,
          })
        ).map((item) => ({
          id: item.sessionId,
          provider: 'claude' as const,
          title: item.summary,
          cwd,
          branch: item.gitBranch ?? null,
          updatedAt: item.lastModified,
        }))
      )
    ),
    codexThreads(paths).catch((error: unknown) => {
      console.warn(`could not list Codex threads: ${error}`)
      return []
    }),
    openCodeSessions(paths).catch((error: unknown) => {
      console.warn(`could not list OpenCode sessions: ${error}`)
      return []
    }),
  ])
  const found = [
    ...claude.flat(),
    ...codex.map((thread) => ({
      id: thread.id,
      provider: 'codex' as const,
      title: thread.name ?? thread.preview,
      cwd: thread.cwd,
      branch: thread.gitInfo?.branch ?? null,
      updatedAt: thread.updatedAt * 1000,
    })),
    ...opencode.map((session) => ({
      id: session.id,
      provider: 'opencode' as const,
      title: session.title ?? 'New session',
      cwd: session.location.directory,
      branch: null,
      updatedAt: session.time.updated,
    })),
  ]
  return found.map((item): Session => {
    providers.set(item.id, item.provider)
    const record = records.get(item.id)
    const updatedAt = record?.interactedAt ?? item.updatedAt
    return {
      ...item,
      updatedAt,
      status:
        record === undefined ||
        (record.status === 'active' && Date.now() - updatedAt > day)
          ? 'inactive'
          : record.status,
    }
  })
}

export function providerOf(sessionId: string) {
  const provider = runs.get(sessionId)?.provider ?? providers.get(sessionId)
  if (provider === undefined)
    throw new Error('offsite does not know this session yet, reload the page')
  return provider
}

export function recordInteraction(id: string) {
  db.prepare(
    "INSERT INTO sessions (session_id, interacted_at, status) VALUES (?, ?, 'active') ON CONFLICT (session_id) DO UPDATE SET interacted_at = excluded.interacted_at, status = CASE status WHEN 'pinned' THEN 'pinned' ELSE 'active' END"
  ).run(id, Date.now())
}

export async function publishSessions() {
  try {
    broadcast({ type: 'sessions', sessions: await sessions() })
  } catch (error) {
    console.warn(`could not list threads: ${error}`)
  }
}

export function watchSessions() {
  for (const watcher of watchers) watcher.close()
  watchers = [
    path.join(readConfig().claudeBaseDir, 'projects'),
    path.join(codexBaseDir, 'sessions'),
  ].flatMap((dir) => {
    try {
      const watcher = watch(dir, { recursive: true }, refreshSessions)
      watcher.on('error', (error) =>
        console.warn(`stopped watching ${dir}: ${error}`)
      )
      return [watcher]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return []
    }
  })
}

export function refreshSessions() {
  timer ??= setTimeout(() => {
    timer = undefined
    void publishSessions()
  }, 1000)
}

export async function updateSession(id: string, patch: SessionPatch) {
  if (patch.title !== undefined)
    switch (providerOf(id)) {
      case 'claude':
        await renameSession(id, patch.title)
        break
      case 'codex':
        await renameThread(id, patch.title)
        break
      case 'opencode':
        await renameOpenCode(id, patch.title)
    }
  if (patch.status === 'inactive')
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
  else if (patch.status !== undefined)
    db.prepare(
      'INSERT INTO sessions (session_id, status) VALUES (?, ?) ON CONFLICT (session_id) DO UPDATE SET status = excluded.status'
    ).run(id, patch.status)
}

export async function removeSession(id: string) {
  const provider = providerOf(id)
  const run = runs.get(id)
  if (run !== undefined) {
    run.stop()
    await run.closed
  }
  switch (provider) {
    case 'claude':
      await deleteSession(id)
      break
    case 'codex':
      await deleteThread(id)
      break
    case 'opencode':
      await removeOpenCode(id)
  }
  db.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
}

export async function fork(sessionId: string, cwd: string, messageId: string) {
  if (providerOf(sessionId) === 'codex') return forkThread(sessionId, messageId)
  if (providerOf(sessionId) === 'opencode')
    return forkOpenCode(sessionId, messageId)
  const disk = await getSessionMessages(sessionId, { dir: cwd })
  const index = disk.findIndex((item) => item.uuid === messageId)
  if (index < 0) throw new Error('Cannot fork the session at that point')
  const result = await forkSession(sessionId, {
    dir: cwd,
    upToMessageId: messageId,
  })
  return { sessionId: result.sessionId }
}

function readRecords() {
  const records = new Map<
    string,
    { interactedAt: number | null; status: 'active' | 'pinned' | 'minimized' }
  >()
  for (const row of db
    .prepare('SELECT session_id, interacted_at, status FROM sessions')
    .all()) {
    if (
      typeof row.session_id !== 'string' ||
      (typeof row.interacted_at !== 'number' && row.interacted_at !== null) ||
      (row.status !== 'active' &&
        row.status !== 'pinned' &&
        row.status !== 'minimized')
    )
      throw new Error('The sessions table has an unexpected row')
    records.set(row.session_id, {
      interactedAt: row.interacted_at,
      status: row.status,
    })
  }
  return records
}
