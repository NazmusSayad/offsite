import { randomUUID } from 'node:crypto'
import type { Bookmark, BookmarkRef } from '@offsite/core/bookmarks'
import type { Item } from '@offsite/core/items'
import type { Session } from '@offsite/core/sessions'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { earlier } from '../lib/claude/index.ts'
import { broadcast } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { db } from '../storage/db.ts'
import { bookmarks as bookmarksTable } from '../storage/schema.ts'
import { projectPath } from './projects.ts'
import { sessionHistory } from './runs.ts'
import { findSession } from './sessions.ts'

const log = logger.withTag('bookmarks')

const targetSchema = z.strictObject({
  sessionId: z.string(),
  itemId: z.string().nullable(),
  start: z.number().int().min(0).nullable(),
  end: z.number().int().min(0).nullable(),
})

export function readBookmarks(): BookmarkRef[] {
  return db.select().from(bookmarksTable).all()
}

export function addBookmark(value: unknown) {
  const result = targetSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  const target = result.data
  if (
    readBookmarks().some(
      (bookmark) =>
        bookmark.sessionId === target.sessionId &&
        bookmark.itemId === target.itemId &&
        bookmark.start === target.start &&
        bookmark.end === target.end
    )
  ) {
    return null
  }
  db.insert(bookmarksTable)
    .values({ ...target, id: randomUUID(), createdAt: Date.now() })
    .run()
  broadcast({ type: 'bookmarks', bookmarks: readBookmarks() })
  return null
}

export function removeBookmark(id: string) {
  db.delete(bookmarksTable).where(eq(bookmarksTable.id, id)).run()
  broadcast({ type: 'bookmarks', bookmarks: readBookmarks() })
  return null
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const refs = readBookmarks()
  const sessionIds = [...new Set(refs.map((ref) => ref.sessionId))]
  const loaded = new Map(
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        const session = await readSession(sessionId)
        const wanted = refs.flatMap((ref) =>
          ref.sessionId === sessionId && ref.itemId !== null ? [ref.itemId] : []
        )
        const items =
          session === null || wanted.length === 0
            ? []
            : await readItems(session, wanted)
        return [sessionId, { session, items }] as const
      })
    )
  )
  return refs.map((ref) => {
    const found = loaded.get(ref.sessionId)
    if (found === undefined) {
      throw new Error(`session ${ref.sessionId} was not loaded`)
    }
    return {
      ...ref,
      session: found.session,
      message: messageOf(ref, found.items),
    }
  })
}

async function readSession(sessionId: string) {
  try {
    return await findSession(sessionId)
  } catch (error) {
    log.warn(`could not read bookmarked session ${sessionId}:`, error)
    return null
  }
}

async function readItems(session: Session, wanted: string[]) {
  try {
    return await sessionItems(session, wanted)
  } catch (error) {
    log.warn(`could not read the messages of session ${session.id}:`, error)
    return []
  }
}

async function sessionItems(session: Session, wanted: string[]) {
  const event = await sessionHistory(session.id, projectPath(session.projectId))
  if (event.type !== 'history') {
    throw new Error(`could not read session ${session.id}`)
  }
  let items = event.items
  let before = event.before
  while (
    before !== null &&
    !wanted.every((id) => items.some((item) => item.id === id))
  ) {
    const page = await earlier(session.id, before)
    items = [...page.items, ...items]
    before = page.before
  }
  return items
}

function messageOf(ref: BookmarkRef, items: Item[]): Bookmark['message'] {
  const item = items.find((candidate) => candidate.id === ref.itemId)
  if (item === undefined) {
    return null
  }
  if (item.kind !== 'user' && item.kind !== 'assistant') {
    log.warn(`bookmark ${ref.id} points to a ${item.kind} item`)
    return null
  }
  const text =
    ref.start !== null && ref.end !== null
      ? item.text.slice(ref.start, ref.end)
      : item.text
  return { author: item.kind, text }
}
