import type {
  LastMessageAtForAccount,
  LastPickedEffortForModel,
  LastPickedModelForProvider,
  SessionSettings,
} from '@offsite/core/config'
import { isNotNull, lt, sql } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from './db.ts'
import { interactions } from './schema.ts'

const KEEP = 90 * 24 * 60 * 60 * 1000
const BURST = 30 * 60 * 1000
const HALF_LIFE = 7 * 24 * 60 * 60 * 1000

let scores: Map<string, number> | null = null

export function savePrompt(prompt: {
  settings: SessionSettings
  project: string
  worktree: string | null
  session: string
}) {
  const now = Date.now()
  db.delete(interactions)
    .where(lt(interactions.createdAt, now - KEEP))
    .run()
  db.insert(interactions)
    .values({
      provider: prompt.settings.provider,
      account: prompt.settings.accountId,
      model: prompt.settings.model,
      effort: prompt.settings.effort,
      project: prompt.project,
      projectWorktree: prompt.worktree,
      projectSession: prompt.session,
      createdAt: now,
    })
    .run()
  scores = null
  broadcast({ type: 'lastUsed', lastUsed: readLastModels() })
  broadcast({ type: 'lastSent', lastSent: readLastSent() })
  broadcast({ type: 'lastEfforts', lastEfforts: readLastEfforts() })
}

export function projectScores() {
  if (scores !== null) {
    return scores
  }
  const now = Date.now()
  const bucket = sql<number>`${interactions.createdAt} / ${sql.raw(String(BURST))}`
  const rows = db
    .select({ project: interactions.project, bucket })
    .from(interactions)
    .groupBy(interactions.project, bucket)
    .all()
  const computed = new Map<string, number>()
  for (const row of rows) {
    computed.set(
      row.project,
      (computed.get(row.project) ?? 0) +
        2 ** (-(now - row.bucket * BURST) / HALF_LIFE)
    )
  }
  scores = computed
  return computed
}

export function readLastModels(): LastPickedModelForProvider[] {
  return db
    .select({
      provider: interactions.provider,
      accountId: interactions.account,
      model: sql<string>`${interactions.model}`,
      usedAt: sql<number>`max(${interactions.createdAt})`,
    })
    .from(interactions)
    .where(isNotNull(interactions.model))
    .groupBy(interactions.provider)
    .all()
}

export function readLastSent(): LastMessageAtForAccount[] {
  return db
    .select({
      accountId: sql<string>`${interactions.account}`,
      sentAt: sql<number>`max(${interactions.createdAt})`,
    })
    .from(interactions)
    .where(isNotNull(interactions.account))
    .groupBy(interactions.account)
    .all()
}

export function readLastEfforts(): LastPickedEffortForModel[] {
  return db
    .select({
      provider: interactions.provider,
      model: sql<string>`${interactions.model}`,
      effort: interactions.effort,
      usedAt: sql<number>`max(${interactions.createdAt})`,
    })
    .from(interactions)
    .where(isNotNull(interactions.model))
    .groupBy(interactions.provider, interactions.model)
    .all()
}
