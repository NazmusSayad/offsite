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
import { readJson, writeJson } from './storage.ts'

type Marks = { pinned: string[]; archived: string[] }

let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | undefined

export async function sessions(): Promise<Session[]> {
  const marks = readMarks()
  const prompts = readPrompts()
  const lists = await Promise.all(
    projects().map(async (project) =>
      (
        await listSessions({
          dir: project.path,
          includeWorktrees: false,
          includeProgrammatic: false,
        })
      ).map((item) => ({
        id: item.sessionId,
        title: item.summary,
        cwd: project.path,
        branch: item.gitBranch ?? null,
        updatedAt: prompts.get(item.sessionId) ?? item.lastModified,
        pinned: marks.pinned.includes(item.sessionId),
        archived: marks.archived.includes(item.sessionId),
      }))
    )
  )
  return lists.flat()
}

export function recordPrompt(id: string) {
  db.prepare(
    'INSERT INTO prompts (session_id, time) VALUES (?, ?) ON CONFLICT (session_id) DO UPDATE SET time = excluded.time'
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
  const marks = readMarks()
  if (patch.pinned !== undefined)
    marks.pinned = mark(marks.pinned, id, patch.pinned)
  if (patch.archived !== undefined)
    marks.archived = mark(marks.archived, id, patch.archived)
  writeMarks(marks)
}

export async function removeSession(id: string) {
  const run = runs.get(id)
  if (run !== undefined) {
    run.stop()
    await run.closed
  }
  await deleteSession(id)
  const marks = readMarks()
  writeMarks({
    pinned: mark(marks.pinned, id, false),
    archived: mark(marks.archived, id, false),
  })
  db.prepare('DELETE FROM prompts WHERE session_id = ?').run(id)
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

function readMarks() {
  return (
    (readJson('sessions.json') as Marks | null) ?? { pinned: [], archived: [] }
  )
}

function readPrompts() {
  const prompts = new Map<string, number>()
  for (const row of db.prepare('SELECT session_id, time FROM prompts').all()) {
    if (typeof row.session_id !== 'string' || typeof row.time !== 'number')
      throw new Error('The prompts table has an unexpected row')
    prompts.set(row.session_id, row.time)
  }
  return prompts
}

function writeMarks(marks: Marks) {
  writeJson('sessions.json', marks)
}

function mark(ids: string[], id: string, on: boolean) {
  const rest = ids.filter((item) => item !== id)
  return on ? [...rest, id] : rest
}
