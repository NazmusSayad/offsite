import { readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type {
  Account,
  ProviderCapabilities,
  RateLimit,
} from '@offsite/core/protocol'
import { type StoredAccount, storedAccounts } from '../../services/accounts.ts'
import { broadcast } from '../hub.ts'
import { type AppServer, appServer, codexBaseDir } from './app-server.ts'
import type { CodexModel, RateLimitSnapshot, Skill } from './types.ts'

const privateEntries = [
  'auth.json',
  'models_cache.json',
  'log',
  'memories',
  'tmp',
]

type CodexLogin =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: string }
  | { type: 'amazonBedrock' }

const windowNames = new Map([
  [300, 'five_hour'],
  [10080, 'seven_day'],
])

export async function codexAccount(account: StoredAccount): Promise<Account> {
  const linked = isMirror(account.configDir)
  const base = { ...account, email: null, plan: null, limits: [], linked }
  try {
    const server = appServer(account.configDir)
    const result = await server.request<{ account: CodexLogin | null }>(
      'account/read',
      {}
    )
    if (result.account === null)
      return {
        ...base,
        error: `Not logged in. Run CODEX_HOME=${account.configDir} codex login in a terminal`,
        valid: false,
      }
    switch (result.account.type) {
      case 'chatgpt':
        return {
          ...base,
          email: result.account.email,
          plan: result.account.planType,
          error: null,
          limits: await rateLimits(server),
          valid: linked,
        }
      case 'apiKey':
        return { ...base, plan: 'API key', error: null, valid: linked }
      case 'amazonBedrock':
        return { ...base, plan: 'Amazon Bedrock', error: null, valid: linked }
    }
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
      valid: false,
    }
  }
}

export async function codexCapabilities(
  account: StoredAccount,
  cwd: string
): Promise<ProviderCapabilities> {
  const server = appServer(account.configDir)
  const models: CodexModel[] = []
  let cursor: string | null = null
  do {
    const page: { data: CodexModel[]; nextCursor: string | null } =
      await server.request('model/list', { cursor })
    models.push(...page.data)
    cursor = page.nextCursor
  } while (cursor !== null)
  return {
    models: models
      .filter((model) => !model.hidden)
      .map((model) => ({
        value: model.model,
        name: model.displayName,
        description: model.description,
        efforts: model.supportedReasoningEfforts.map(
          (effort) => effort.reasoningEffort
        ),
      })),
    commands: [
      {
        name: 'compact',
        description: 'Summarize the conversation to free up context',
        hint: '',
      },
      ...(await skills(server, cwd)).map((skill) => ({
        name: skill.name,
        description: skill.description,
        hint: '',
      })),
    ],
    agents: [],
  }
}

export async function skills(server: AppServer, cwd: string) {
  const result = await server.request<{
    data: { cwd: string; skills: (Skill & { enabled: boolean })[] }[]
  }>('skills/list', { cwds: [cwd] })
  return result.data.flatMap((entry) =>
    entry.skills.filter((skill) => skill.enabled)
  )
}

export function publishCodexLimits(home: string, snapshot: RateLimitSnapshot) {
  for (const account of storedAccounts())
    if (account.provider === 'codex' && account.configDir === home)
      broadcast({
        type: 'limits',
        accountId: account.id,
        limits: toLimits(snapshot),
      })
}

async function rateLimits(server: AppServer) {
  try {
    const result = await server.request<{ rateLimits: RateLimitSnapshot }>(
      'account/rateLimits/read',
      {}
    )
    return toLimits(result.rateLimits)
  } catch (error) {
    console.warn(`could not read Codex usage limits: ${error}`)
    return []
  }
}

function toLimits(snapshot: RateLimitSnapshot): RateLimit[] {
  return [snapshot.primary, snapshot.secondary].flatMap((window) =>
    window === null
      ? []
      : [
          {
            window:
              (window.windowDurationMins === null
                ? undefined
                : windowNames.get(window.windowDurationMins)) ??
              `${window.windowDurationMins ?? 0}m`,
            utilization: window.usedPercent / 100,
            resetsAt: window.resetsAt,
            rejected: window.usedPercent >= 100,
          },
        ]
  )
}

function isMirror(dir: string) {
  try {
    if (realpathSync(dir) === realpathSync(codexBaseDir)) return true
    return readdirSync(codexBaseDir)
      .filter(
        (name) =>
          !privateEntries.includes(name) && !/-(wal|shm|journal)$/.test(name)
      )
      .every(
        (name) =>
          realpathSync(path.join(dir, name)) ===
          realpathSync(path.join(codexBaseDir, name))
      )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
