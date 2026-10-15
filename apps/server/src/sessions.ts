import {
  deleteSession,
  forkSession,
  getSessionMessages,
  listSessions,
  renameSession,
} from '@anthropic-ai/claude-agent-sdk'
import { projects } from './projects.ts'
import type { Session, SessionPatch } from './protocol.ts'
import { runs } from './run.ts'
import { readJson, writeJson } from './storage.ts'

type Marks = { pinned: string[]; archived: string[] }

export async function sessions(): Promise<Session[]> {
  const marks = readMarks()
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
        updatedAt: item.lastModified,
        pinned: marks.pinned.includes(item.sessionId),
        archived: marks.archived.includes(item.sessionId),
      }))
    )
  )
  return lists.flat()
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

function writeMarks(marks: Marks) {
  writeJson('sessions.json', marks)
}

function mark(ids: string[], id: string, on: boolean) {
  const rest = ids.filter((item) => item !== id)
  return on ? [...rest, id] : rest
}
