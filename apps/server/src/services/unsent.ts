import type { UnsentPrompt } from '@offsite/core/items'
import type { RpcMethods } from '@offsite/core/protocol'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { unsentPrompts } from '../storage/schema.ts'

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
  broadcastUnsent()
}

export function findUnsent(id: string) {
  return db.select().from(unsentPrompts).where(eq(unsentPrompts.id, id)).get()
}

export function allUnsent(): UnsentPrompt[] {
  return db
    .select()
    .from(unsentPrompts)
    .orderBy(asc(unsentPrompts.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      projectId: row.projectId,
      prompt: row.request.prompt,
      status: row.status,
    }))
}

export function queuedFor(sessionId: string) {
  return allUnsent().filter(
    (item) => item.sessionId === sessionId && item.status === 'queued'
  )
}

export function moveUnsent(id: string, sessionId: string, projectId: string) {
  db.update(unsentPrompts)
    .set({ sessionId, projectId })
    .where(eq(unsentPrompts.id, id))
    .run()
  broadcastUnsent()
}

export function setUnsentStatus(id: string, status: UnsentPrompt['status']) {
  db.update(unsentPrompts).set({ status }).where(eq(unsentPrompts.id, id)).run()
  broadcastUnsent()
}

export function removeUnsent(id: string) {
  db.delete(unsentPrompts).where(eq(unsentPrompts.id, id)).run()
  broadcastUnsent()
}

export function removeSessionUnsent(sessionId: string) {
  db.delete(unsentPrompts).where(eq(unsentPrompts.sessionId, sessionId)).run()
  broadcastUnsent()
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
  broadcastUnsent()
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

function broadcastUnsent() {
  broadcast({ type: 'unsent', unsent: allUnsent() })
}
