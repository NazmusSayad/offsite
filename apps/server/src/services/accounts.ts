import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type {
  Account,
  Accounts,
  Capabilities,
  Provider,
} from '@offsite/core/providers'
import {
  defaultEfforts,
  defaultModels,
  deprecatedModels,
} from '../constants.ts'
import {
  claudeAccount,
  claudeCapabilities,
  forgetClaude,
  linkClaude,
  linkPlan,
} from '../lib/claude/index.ts'
import {
  codexAccount,
  codexBaseDir,
  codexCapabilities,
  stopAppServer,
  stopAppServers,
} from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { logger } from '../lib/log.ts'
import { disconnectOpenCode } from '../lib/opencode/client.ts'
import {
  openCodeCapabilities,
  openCodeInstalled,
} from '../lib/opencode/index.ts'
import {
  claudeBaseDir,
  platform,
  readConfig,
  saveConfig,
} from '../storage/config.ts'
import { forgetUsage } from './usage.ts'

const log = logger.withTag('accounts')

export type StoredAccount = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  color: string | null
  configDir: string | null
  enabled: boolean
}

const providerNames: Record<Provider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
}

export function providerName(provider: Provider) {
  return providerNames[provider]
}

export function storedAccounts(): StoredAccount[] {
  const config = readConfig()
  return [
    ...config.claude.accounts.map((item) => ({
      ...item,
      configDir: item.configDir[platform()],
    })),
    ...config.codex.accounts.map((item) => ({
      ...item,
      configDir: item.configDir[platform()],
    })),
  ]
}

export function assertEnabled(provider: Provider, accountId: string | null) {
  if (!readConfig()[provider].enabled) {
    throw new Error(`${providerName(provider)} is disabled in Settings`)
  }
  if (provider === 'opencode') {
    return
  }
  if (!storedAccount(provider, accountId).enabled) {
    throw new Error('That account is disabled in Settings')
  }
}

export async function stopProvider(provider: Provider) {
  const stopping = [...runs.values()].filter((run) => run.provider === provider)
  for (const run of stopping) {
    run.stop()
  }
  await Promise.all(stopping.map((run) => run.closed))
  if (provider === 'codex') {
    stopAppServers()
  }
  if (provider === 'opencode') {
    disconnectOpenCode()
  }
  if (provider === 'claude') {
    for (const account of storedAccounts()) {
      if (account.provider === 'claude') {
        forgetClaude(account.id)
      }
    }
  }
}

async function stopAccount(account: StoredAccount) {
  const stopping = [...runs.values()].filter(
    (run) => run.settings.accountId === account.id
  )
  for (const run of stopping) {
    run.stop()
  }
  await Promise.all(stopping.map((run) => run.closed))
  if (account.provider === 'codex') {
    stopAppServer(account.configDir ?? codexBaseDir)
  }
  if (account.provider === 'claude') {
    forgetClaude(account.id)
  }
}

export function storedAccount(provider: Provider, accountId: string | null) {
  if (accountId === null) {
    throw new Error(
      `Add a ${providerName(provider)} account in Settings → Accounts`
    )
  }
  const account = storedAccounts().find((item) => item.id === accountId)
  if (account === undefined) {
    throw new Error('That account was removed')
  }
  if (account.provider !== provider) {
    throw new Error(`That account is not a ${providerName(provider)} account`)
  }
  return account
}

export async function accounts(): Promise<Accounts> {
  const stored = await Promise.all(
    storedAccounts().map((account) => {
      if (!account.enabled || !readConfig()[account.provider].enabled) {
        return disabledAccount(account)
      }
      switch (account.provider) {
        case 'claude':
          return claudeAccount(account)
        case 'codex':
          return codexAccount(account)
      }
    })
  )
  return {
    claudeAccounts: stored.filter((item) => item.provider === 'claude'),
    codexAccounts: stored.filter((item) => item.provider === 'codex'),
    openCode: {
      available: openCodeInstalled() && readConfig().opencode.enabled,
    },
  }
}

function disabledAccount(account: StoredAccount): Account {
  return {
    ...account,
    email: null,
    displayName: null,
    organization: null,
    identity: null,
    plan: null,
    error: null,
    linked: true,
    valid: false,
  }
}

export async function publishAccounts() {
  try {
    broadcast({ type: 'accounts', ...(await accounts()) })
  } catch (error) {
    log.warn(`could not list accounts:`, error)
  }
}

export async function capabilities(
  provider: Provider,
  accountId: string | null,
  cwd: string
): Promise<Capabilities> {
  assertEnabled(provider, accountId)
  const result = await providerCapabilities(provider, accountId, cwd)
  const config = readConfig()
  const settings = config[provider].models
  return {
    ...result,
    defaultModel: defaultModels[provider],
    models: result.models.map((model) => {
      const deprecated = deprecatedModels[provider].includes(model.value)
      const setting = settings[model.value] ?? { hidden: deprecated }
      const preferred = defaultEfforts[provider]
      const effort =
        preferred === null
          ? null
          : model.efforts.includes(preferred)
            ? preferred
            : (model.efforts.at(-1) ?? null)
      return {
        ...model,
        deprecated,
        hidden: setting.hidden,
        effort,
      }
    }),
  }
}

function providerCapabilities(
  provider: Provider,
  accountId: string | null,
  cwd: string
) {
  switch (provider) {
    case 'claude':
      return claudeCapabilities(storedAccount(provider, accountId), cwd)
    case 'codex':
      return codexCapabilities(storedAccount(provider, accountId), cwd)
    case 'opencode':
      if (accountId !== null) {
        throw new Error(
          'OpenCode has no accounts. Connect providers in OpenCode'
        )
      }
      return openCodeCapabilities(cwd)
  }
}

export function addAccount(
  provider: Exclude<Provider, 'opencode'>,
  name: string,
  configDir: string
) {
  const account = validAccount(name, configDir)
  const config = readConfig()
  saveConfig({
    ...config,
    [provider]: {
      ...config[provider],
      accounts: [
        ...config[provider].accounts,
        {
          id: randomUUID(),
          provider,
          name: account.name,
          color: null,
          configDir: { [platform()]: account.configDir },
          enabled: true,
        },
      ],
    },
  })
  void publishAccounts()
  return null
}

export async function updateAccount(update: Omit<StoredAccount, 'provider'>) {
  const before = storedAccounts().find((item) => item.id === update.id)
  if (before === undefined) {
    throw new Error('That account was removed')
  }
  const account = validAccount(update.name, update.configDir)
  const config = readConfig()
  saveConfig({
    ...config,
    [before.provider]: {
      ...config[before.provider],
      accounts: config[before.provider].accounts.map((item) =>
        item.id === update.id
          ? {
              ...item,
              name: account.name,
              color: update.color,
              configDir: { ...item.configDir, [platform()]: account.configDir },
              enabled: update.enabled,
            }
          : item
      ),
    },
  })
  forgetClaude(update.id)
  forgetUsage(update.id)
  if (before.enabled && !update.enabled) {
    await stopAccount(before)
  }
  void publishAccounts()
  return null
}

export function accountLinkPlan(id: string) {
  const account = storedAccount('claude', id)
  return linkPlan(account.configDir ?? claudeBaseDir())
}

export async function linkAccount(id: string) {
  const account = storedAccount('claude', id)
  await stopAccount(account)
  try {
    await linkClaude(account.configDir ?? claudeBaseDir())
  } finally {
    void publishAccounts()
  }
  return null
}

export function removeAccount(id: string) {
  const config = readConfig()
  saveConfig({
    ...config,
    claude: {
      ...config.claude,
      accounts: config.claude.accounts.filter((item) => item.id !== id),
    },
    codex: {
      ...config.codex,
      accounts: config.codex.accounts.filter((item) => item.id !== id),
    },
  })
  forgetClaude(id)
  forgetUsage(id)
  void publishAccounts()
  return null
}

function validAccount(name: string, configDir: string | null) {
  if (name.trim() === '') {
    throw new Error('Give the account a name')
  }
  if (configDir === null) {
    return { name: name.trim(), configDir: null }
  }
  const dir = configDir.trim()
  if (dir === '') {
    return { name: name.trim(), configDir: null }
  }
  if (dir === '~' || dir.startsWith('~/')) {
    return {
      name: name.trim(),
      configDir: path.join(os.homedir(), dir.slice(1)),
    }
  }
  if (path.isAbsolute(dir)) {
    return { name: name.trim(), configDir: dir }
  }
  throw new Error('Use an absolute config directory or one starting with ~/')
}
