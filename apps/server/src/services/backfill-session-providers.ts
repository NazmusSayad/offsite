// ONE-TIME BACKFILL. This file exists only for this purpose.
//
// The `provider` column was added to the `sessions` table later. Rows saved
// before that have no provider, so offsite cannot tell which provider owns
// them. On server start, this asks every enabled provider about each of those
// rows and saves the single provider that knows the thread.
//
// Codex and OpenCode throw an error for IDs in another provider's format, so
// an error counts as "does not know this thread". A row is left empty, and
// retried on the next start, when no provider knows the thread or when more
// than one does.
//
// Once every install has run it, delete this file and its call in main.ts.
import type { Provider } from '@offsite/core/providers'
import { eq, isNull } from 'drizzle-orm'
import { logger } from '../lib/log.ts'
import { readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import { sessions as sessionsTable } from '../storage/schema.ts'
import { providerName } from './accounts.ts'
import { projects } from './projects.ts'
import { info, timeLimit } from './provider-sessions.ts'

const log = logger.withTag('backfill')

const allProviders: Provider[] = ['claude', 'codex', 'opencode']

export async function backfillSessionProviders() {
  const rows = db
    .select()
    .from(sessionsTable)
    .where(isNull(sessionsTable.provider))
    .all()
  if (rows.length === 0) {
    return
  }
  const paths = new Map(
    projects().map((project): [string, string] => [project.path, project.id])
  )
  const enabled = allProviders.filter(
    (provider) => readConfig().enabledProviders[provider]
  )
  for (const row of rows) {
    const answers = await Promise.all(
      enabled.map(async (provider) => {
        try {
          const item = await timeLimit(
            info(provider, row.sessionId, paths),
            `${providerName(provider)} did not answer in time`
          )
          return item !== null
        } catch (error) {
          log.debug(
            `${providerName(provider)} does not know session ${row.sessionId}:`,
            error
          )
          return false
        }
      })
    )
    const owners = enabled.filter((_, index) => answers[index])
    if (owners.length !== 1) {
      log.warn(
        `${owners.length} providers know session ${row.sessionId}, it stays without a provider until the next start`
      )
      continue
    }
    db.update(sessionsTable)
      .set({ provider: owners[0] })
      .where(eq(sessionsTable.sessionId, row.sessionId))
      .run()
    log.info(
      `saved ${providerName(owners[0])} as the provider of session ${row.sessionId}`
    )
  }
}
