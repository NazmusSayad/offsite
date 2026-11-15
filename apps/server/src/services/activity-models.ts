import os from 'node:os'
import type { Provider } from '@offsite/core/providers'
import type { ThreadModel } from '@offsite/core/sessions'
import { logger } from '../lib/log.ts'
import { sessionSettings } from '../storage/interactions.ts'
import { capabilities } from './accounts.ts'

const log = logger.withTag('activity')
const names = new Map<string, Promise<Record<string, string>>>()

export async function activityModels(sessionIds: string[]) {
  return Object.fromEntries(
    await Promise.all(
      sessionIds.map(async (id): Promise<[string, ThreadModel]> => {
        const settings = sessionSettings(id)
        if (settings === undefined) {
          return [id, { accountId: null, model: null }]
        }
        const name =
          settings.model === null
            ? 'Default'
            : ((await modelNames(settings.provider, settings.accountId))[
                settings.model
              ] ?? settings.model)
        return [
          id,
          {
            accountId: settings.accountId,
            model:
              settings.effort === null
                ? name
                : `${name} · ${settings.effort.charAt(0).toUpperCase()}${settings.effort.slice(1)}`,
          },
        ]
      })
    )
  )
}

function modelNames(
  provider: Provider,
  accountId: string | null
): Promise<Record<string, string>> {
  const key = `${provider}\n${accountId}`
  const cached = names.get(key)
  if (cached !== undefined) {
    return cached
  }
  const loading = capabilities(provider, accountId, os.homedir()).then(
    (result) =>
      Object.fromEntries(
        result.models.map((model) => [model.value, model.name])
      ),
    (error: unknown) => {
      names.delete(key)
      log.warn(`could not list ${provider} models:`, error)
      return {}
    }
  )
  names.set(key, loading)
  return loading
}
