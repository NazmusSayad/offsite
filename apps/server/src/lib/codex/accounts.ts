import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type {
  Account,
  ProviderCapabilities,
  RateLimit,
} from '@offsite/core/providers'
import { type StoredAccount, storedAccounts } from '../../services/accounts.ts'
import { recordLimits } from '../../services/usage.ts'
import { isRecord } from '../claude/content.ts'
import { logger } from '../log.ts'
import { type AppServer, appServer, codexBaseDir } from './app-server.ts'
import type { CodexModel, RateLimitSnapshot, Skill } from './types.ts'

const log = logger.withTag('codex')

const privateEntries = [
  'auth.json',
  'models_cache.json',
  'log',
  'memories',
  'tmp',
]

type CodexLogin =
  | { type: 'apiKey' }
  | {
      type: 'chatgpt'
      email: string | null
      planType: string
      workspaceName: string | null
    }
  | { type: 'amazonBedrock' }

export async function codexAccount(account: StoredAccount): Promise<Account> {
  const configDir = account.configDir ?? codexBaseDir
  const linked = isMirror(configDir)
  const base = {
    ...account,
    email: null,
    displayName: null,
    organization: null,
    identity: null,
    plan: null,
    linked,
    fullyLinked: linked,
  }
  try {
    const server = appServer(configDir)
    const result = await server.request<{ account: CodexLogin | null }>(
      'account/read',
      {}
    )
    if (result.account === null) {
      return {
        ...base,
        error: `Not logged in. Run CODEX_HOME=${configDir} codex login in a terminal`,
        valid: false,
      }
    }
    switch (result.account.type) {
      case 'chatgpt':
        return {
          ...base,
          email: result.account.email,
          ...codexLogin(configDir),
          organization: result.account.workspaceName,
          plan: result.account.planType,
          error: null,
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
  const server = appServer(account.configDir ?? codexBaseDir)
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
        inline: false,
      },
      ...(await skills(server, cwd)).map((skill) => ({
        name: skill.name,
        description: skill.description,
        hint: '',
        inline: false,
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
  for (const account of storedAccounts()) {
    if (
      account.provider === 'codex' &&
      (account.configDir ?? codexBaseDir) === home
    ) {
      recordLimits(account.id, toLimits(snapshot))
    }
  }
}

export async function codexLimits(account: StoredAccount) {
  const result = await appServer(account.configDir ?? codexBaseDir).request<{
    rateLimits: RateLimitSnapshot
  }>('account/rateLimits/read', {})
  return toLimits(result.rateLimits)
}

function toLimits(snapshot: RateLimitSnapshot): RateLimit[] {
  return [snapshot.primary, snapshot.secondary].flatMap((window) =>
    window === null || window.windowDurationMins === null
      ? []
      : [
          {
            window: String(window.windowDurationMins),
            utilization: window.usedPercent / 100,
            resetsAt: window.resetsAt,
            rejected: window.usedPercent >= 100,
          },
        ]
  )
}

function codexLogin(home: string) {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path.join(home, 'auth.json'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn(`could not read the Codex account:`, error)
    }
    return { displayName: null, identity: null }
  }
  if (
    !isRecord(raw) ||
    !isRecord(raw.tokens) ||
    typeof raw.tokens.id_token !== 'string'
  ) {
    return { displayName: null, identity: null }
  }
  const payload = raw.tokens.id_token.split('.').at(1)
  if (payload === undefined) {
    return { displayName: null, identity: null }
  }
  const claims: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8')
  )
  if (!isRecord(claims)) {
    return { displayName: null, identity: null }
  }
  const name = typeof claims.name === 'string' ? claims.name.trim() : ''
  const auth = claims['https://api.openai.com/auth']
  return {
    displayName: name === '' ? null : name,
    identity:
      isRecord(auth) &&
      typeof auth.chatgpt_user_id === 'string' &&
      typeof auth.chatgpt_account_id === 'string'
        ? {
            accountId: auth.chatgpt_user_id,
            organizationId: auth.chatgpt_account_id,
          }
        : null,
  }
}

function isMirror(dir: string) {
  try {
    if (realpathSync(dir) === realpathSync(codexBaseDir)) {
      return true
    }
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}
