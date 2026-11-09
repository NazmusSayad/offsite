import type {
  LastMessageAtForAccount,
  LastPickedModelForProvider,
} from '@offsite/core/config'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { db } from './db.ts'
import {
  lastMessageTimes,
  lastPickedEfforts,
  lastPickedModels,
} from './schema.ts'

const lastUsedSchema = z.discriminatedUnion('provider', [
  z.strictObject({
    provider: z.enum(['claude', 'codex']),
    accountId: z.string(),
    model: z.string(),
  }),
  z.strictObject({
    provider: z.literal('opencode'),
    accountId: z.null(),
    model: z.string(),
  }),
])

const lastEffortSchema = z.strictObject({
  provider: z.enum(['claude', 'codex', 'opencode']),
  model: z.string(),
  effort: z.string().nullable(),
})

export function readLastPickedModels(): LastPickedModelForProvider[] {
  return db.select().from(lastPickedModels).all()
}

export function saveLastPickedModel(value: unknown) {
  const result = lastUsedSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  const row = { ...result.data, usedAt: Date.now() }
  db.insert(lastPickedModels)
    .values(row)
    .onConflictDoUpdate({ target: lastPickedModels.provider, set: row })
    .run()
  broadcast({ type: 'lastUsed', lastUsed: readLastPickedModels() })
  return null
}

export function readLastMessageTimes(): LastMessageAtForAccount[] {
  return db.select().from(lastMessageTimes).all()
}

export function saveLastMessageTime(accountId: string) {
  const row = { accountId, sentAt: Date.now() }
  db.insert(lastMessageTimes)
    .values(row)
    .onConflictDoUpdate({ target: lastMessageTimes.accountId, set: row })
    .run()
  broadcast({ type: 'lastSent', lastSent: readLastMessageTimes() })
}

export function readLastPickedEfforts() {
  return db.select().from(lastPickedEfforts).all()
}

export function saveLastPickedEffort(value: unknown) {
  const result = lastEffortSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  db.insert(lastPickedEfforts)
    .values(result.data)
    .onConflictDoUpdate({
      target: [lastPickedEfforts.provider, lastPickedEfforts.model],
      set: { effort: result.data.effort },
    })
    .run()
  broadcast({ type: 'lastEfforts', lastEfforts: readLastPickedEfforts() })
  return null
}
