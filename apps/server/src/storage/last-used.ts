import type { LastUsedModel } from '@offsite/core/config'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { db } from './db.ts'
import { lastEfforts, lastUsedModels } from './schema.ts'

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

export function readLastUsed(): LastUsedModel[] {
  return db.select().from(lastUsedModels).all()
}

export function saveLastUsed(value: unknown) {
  const result = lastUsedSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  const row = { ...result.data, usedAt: Date.now() }
  db.insert(lastUsedModels)
    .values(row)
    .onConflictDoUpdate({ target: lastUsedModels.provider, set: row })
    .run()
  broadcast({ type: 'lastUsed', lastUsed: readLastUsed() })
  return null
}

export function readLastEfforts() {
  return db.select().from(lastEfforts).all()
}

export function saveLastEffort(value: unknown) {
  const result = lastEffortSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  db.insert(lastEfforts)
    .values(result.data)
    .onConflictDoUpdate({
      target: [lastEfforts.provider, lastEfforts.model],
      set: { effort: result.data.effort },
    })
    .run()
  broadcast({ type: 'lastEfforts', lastEfforts: readLastEfforts() })
  return null
}
