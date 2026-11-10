import type { UnsentPrompt } from '@offsite/core/items'
import type { RpcMethods } from '@offsite/core/protocol'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { broadcast, publish } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { unsentPrompts } from '../storage/schema.ts'

type Row = typeof unsentPrompts.$inferSelect

export function saveUnsent(request: RpcMethods['sessions.send']['params']) {
  db.insert(unsentPrompts)
    .values({
      id: request.id,
      sessionId: request.sessionId,
      projectId: request.projectId,
      request,
      status: 'sending',
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: unsentPrompts.id,
      set: { status: 'sending' },
    })
    .run()
  publishUnsent(request.sessionId)
}

export function findUnsent(id: string) {
  return db.select().from(unsentPrompts).where(eq(unsentPrompts.id, id)).get()
}

export function unsentFor(sessionId: string) {
  return db
    .select()
    .from(unsentPrompts)
    .where(eq(unsentPrompts.sessionId, sessionId))
    .orderBy(asc(unsentPrompts.createdAt))
    .all()
    .map(toPrompt)
}

export function startingPrompts() {
  return db
    .select()
    .from(unsentPrompts)
    .where(isNull(unsentPrompts.sessionId))
    .orderBy(asc(unsentPrompts.createdAt))
    .all()
    .map((row) => ({ ...toPrompt(row), projectId: row.projectId }))
}

export function nextQueued(sessionId: string) {
  return unsentFor(sessionId).find((item) => item.status === 'queued')
}

export function moveUnsent(id: string, sessionId: string, projectId: string) {
  db.update(unsentPrompts)
    .set({ sessionId, projectId })
    .where(eq(unsentPrompts.id, id))
    .run()
  publishUnsent(null)
  publishUnsent(sessionId)
}

export function setUnsentStatus(id: string, status: Row['status']) {
  const row = findUnsent(id)
  if (row === undefined) {
    return
  }
  db.update(unsentPrompts).set({ status }).where(eq(unsentPrompts.id, id)).run()
  publishUnsent(row.sessionId)
}

export function removeUnsent(id: string) {
  const row = findUnsent(id)
  if (row === undefined) {
    return
  }
  db.delete(unsentPrompts).where(eq(unsentPrompts.id, id)).run()
  publishUnsent(row.sessionId)
}

export function removeSessionUnsent(sessionId: string) {
  db.delete(unsentPrompts).where(eq(unsentPrompts.sessionId, sessionId)).run()
}

export function failQueued(sessionId: string) {
  db.update(unsentPrompts)
    .set({ status: 'failed' })
    .where(
      and(
        eq(unsentPrompts.sessionId, sessionId),
        eq(unsentPrompts.status, 'queued')
      )
    )
    .run()
  publishUnsent(sessionId)
}

export function failInterrupted() {
  db.update(unsentPrompts)
    .set({ status: 'failed' })
    .where(inArray(unsentPrompts.status, ['sending', 'queued']))
    .run()
}

export class Handover {
  private ids: string[] = []

  async hand(id: string, deliver: () => Promise<unknown>) {
    this.ids.push(id)
    try {
      await deliver()
    } catch (error) {
      this.ids = this.ids.filter((other) => other !== id)
      throw error
    }
  }

  confirm(count: number) {
    for (const id of this.ids.splice(0, count)) {
      removeUnsent(id)
    }
  }

  confirmAll() {
    this.confirm(this.ids.length)
  }
}

function toPrompt(row: Row): UnsentPrompt {
  return { id: row.id, prompt: row.request.prompt, status: row.status }
}

function publishUnsent(sessionId: string | null) {
  if (sessionId === null) {
    broadcast({ type: 'starting', starting: startingPrompts() })
    return
  }
  publish(sessionId, {
    type: 'queue',
    sessionId,
    queue: unsentFor(sessionId),
  })
}
