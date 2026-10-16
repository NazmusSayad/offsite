import { type FSWatcher, watch } from 'node:fs'
import path from 'node:path'
import {
  deleteSession,
  forkSession,
  getSessionMessages,
  listSessions,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import { readConfig } from './config.ts'
import { db } from './db.ts'
import { broadcast } from './hub.ts'
import { projects } from './projects.ts'
import type { Session, SessionPatch } from './protocol.ts'
import { runs } from './run.ts'

const day = 24 * 60 * 60 * 1000

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | undefined

export async function sessions(): Promise<Session[]> {
  const records = readRecords()
  const lists = await Promise.all(
    projects().map(async (project) =>
      (
        await listSessions({
          dir: project.path,
          includeWorktrees: false,
          includeProgrammatic: false,
        })
      ).map((item): Session => {
        const record = records.get(item.sessionId)
        const updatedAt = record?.interactedAt ?? item.lastModified
        return {
          id: item.sessionId,
          title: item.summary,
          cwd: project.path,
          branch: item.gitBranch ?? null,
          updatedAt,
          status:
            record === undefined ||
            (record.status === 'active' && Date.now() - updatedAt > day)
              ? 'inactive'
              : record.status,
        }
      })
    )
  )
  return lists.flat()
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
  watcher?.close()
  watcher = null
  const dir = path.join(readConfig().claudeBaseDir, 'projects')
  try {
    watcher = watch(dir, { recursive: true }, () => {
      timer ??= setTimeout(() => {
        timer = undefined
        void publishSessions()
      }, 1000)
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    console.warn(
      `${dir} does not exist; threads changed outside offsite will not show`
    )
    return
  }
  watcher.on('error', (error) =>
    console.warn(`stopped watching ${dir}: ${error}`)
  )
}

export async function updateSession(id: string, patch: SessionPatch) {
  if (patch.title !== undefined) await renameSession(id, patch.title)
  if (patch.status === 'inactive')
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
  else if (patch.status !== undefined)
    db.prepare(
      'INSERT INTO sessions (session_id, status) VALUES (?, ?) ON CONFLICT (session_id) DO UPDATE SET status = excluded.status'
    ).run(id, patch.status)
}

export async function removeSession(id: string) {
  const run = runs.get(id)
  if (run !== undefined) {
    run.stop()
    await run.closed
  }
  await deleteSession(id)
  db.prepare('DELETE FROM sessions WHERE session_id = ?').run(id)
}

export async function fork(sessionId: string, cwd: string, messageId: string) {
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
