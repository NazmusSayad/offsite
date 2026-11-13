import type { OutboxPrompt } from '@offsite/core/items'
import type { RpcMethods } from '@offsite/core/protocol'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { outbox as outboxTable } from '../storage/schema.ts'
import { notSentNotice } from './session-notices.ts'

export function addToOutbox(request: RpcMethods['sessions.send']['params']) {
  db.insert(outboxTable)
    .values({
      id: request.id,
      sessionId: request.sessionId,
      projectId: request.projectId,
      request,
      status: 'sending',
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: outboxTable.id,
      set: { status: 'sending' },
    })
    .run()
  broadcastOutbox()
}

export function findInOutbox(id: string) {
  return db.select().from(outboxTable).where(eq(outboxTable.id, id)).get()
}

export function outboxPrompts(): OutboxPrompt[] {
  return db
    .select()
    .from(outboxTable)
    .orderBy(asc(outboxTable.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      projectId: row.projectId,
      provider: row.request.settings.provider,
      prompt: row.request.prompt,
      status: row.status,
      snoozed: row.request.status === 'snoozed',
      createdAt: row.createdAt,
    }))
}

export function queuedFor(sessionId: string) {
  return outboxPrompts().filter(
    (item) => item.sessionId === sessionId && item.status === 'queued'
  )
}

export function moveOutboxPrompt(
  id: string,
  sessionId: string,
  projectId: string
) {
  db.update(outboxTable)
    .set({ sessionId, projectId })
    .where(eq(outboxTable.id, id))
    .run()
  broadcastOutbox()
}

export function setOutboxStatus(id: string, status: OutboxPrompt['status']) {
  db.update(outboxTable).set({ status }).where(eq(outboxTable.id, id)).run()
  broadcastOutbox()
}

export function markAccepted(id: string) {
  db.update(outboxTable)
    .set({ status: 'accepted' })
    .where(and(eq(outboxTable.id, id), eq(outboxTable.status, 'sending')))
    .run()
  broadcastOutbox()
}

export function removeFromOutbox(id: string) {
  db.delete(outboxTable).where(eq(outboxTable.id, id)).run()
  broadcastOutbox()
}

export function clearSessionOutbox(sessionId: string) {
  db.delete(outboxTable).where(eq(outboxTable.sessionId, sessionId)).run()
  broadcastOutbox()
}

export function failQueued(sessionId: string) {
  const failing = queuedFor(sessionId)
  db.update(outboxTable)
    .set({ status: 'failed' })
    .where(
      and(
        eq(outboxTable.sessionId, sessionId),
        eq(outboxTable.status, 'queued')
      )
    )
    .run()
  broadcastOutbox()
  notSentNotice(
    failing.map((item) => ({
      id: item.id,
      sessionId: item.sessionId,
      text: item.prompt.text,
    }))
  )
}

export function failInterrupted() {
  db.update(outboxTable)
    .set({ status: 'failed' })
    .where(inArray(outboxTable.status, ['sending', 'accepted', 'queued']))
    .run()
}

export class Handover {
  private ids: string[] = []

  async hand(id: string, deliver: () => Promise<unknown>) {
    this.ids.push(id)
    try {
      await deliver()
      markAccepted(id)
    } catch (error) {
      this.ids = this.ids.filter((other) => other !== id)
      throw error
    }
  }

  confirm(count: number) {
    for (const id of this.ids.splice(0, count)) {
      removeFromOutbox(id)
    }
  }

  confirmAll() {
    this.confirm(this.ids.length)
  }
}

function broadcastOutbox() {
  broadcast({ type: 'outbox', outbox: outboxPrompts() })
}
