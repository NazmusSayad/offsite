import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type {
  Account,
  Accounts,
  Capabilities,
  Provider,
} from '@offsite/core/protocol'
import { defaultModels, deprecatedModels } from '../constants.ts'
import {
  claudeAccount,
  claudeCapabilities,
  forgetClaude,
} from '../lib/claude/index.ts'
import {
  codexAccount,
  codexCapabilities,
  stopAppServer,
  stopAppServers,
} from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { disconnectOpenCode } from '../lib/opencode/client.ts'
import {
  openCodeCapabilities,
  openCodeInstalled,
} from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { readJson, writeJson } from '../storage/storage.ts'

export type StoredAccount = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  configDir: string
  enabled: boolean
  hiddenModels: Record<string, boolean>
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
  const items =
    (readJson('accounts.json') as
      | (Omit<StoredAccount, 'enabled' | 'hiddenModels'> & {
          enabled?: boolean
          hiddenModels?: Record<string, boolean>
        })[]
      | null) ?? []
  return items.map((item) => ({
    id: item.id,
    provider: item.provider,
    name: item.name,
    configDir: item.configDir,
    enabled: item.enabled ?? true,
    hiddenModels: item.hiddenModels ?? {},
  }))
}

export function assertEnabled(provider: Provider, accountId: string | null) {
  if (!readConfig().enabledProviders[provider])
    throw new Error(`${providerName(provider)} is disabled in Settings`)
  if (provider === 'opencode') return
  if (!storedAccount(provider, accountId).enabled)
    throw new Error('That account is disabled in Settings')
}

export async function stopProvider(provider: Provider) {
  const stopping = [...runs.values()].filter((run) => run.provider === provider)
  for (const run of stopping) run.stop()
  await Promise.all(stopping.map((run) => run.closed))
  if (provider === 'codex') stopAppServers()
  if (provider === 'opencode') disconnectOpenCode()
  if (provider === 'claude')
    for (const account of storedAccounts())
      if (account.provider === 'claude') forgetClaude(account.id)
}

async function stopAccount(account: StoredAccount) {
  const stopping = [...runs.values()].filter(
    (run) => run.settings.accountId === account.id
  )
  for (const run of stopping) run.stop()
  await Promise.all(stopping.map((run) => run.closed))
  if (account.provider === 'codex') stopAppServer(account.configDir)
  if (account.provider === 'claude') forgetClaude(account.id)
}

export function storedAccount(provider: Provider, accountId: string | null) {
  if (accountId === null)
    throw new Error(
      `Add a ${providerName(provider)} account in Settings → Accounts`
    )
  const account = storedAccounts().find((item) => item.id === accountId)
  if (account === undefined) throw new Error('That account was removed')
  if (account.provider !== provider)
    throw new Error(`That account is not a ${providerName(provider)} account`)
  return account
}

export async function accounts(): Promise<Accounts> {
  const stored = await Promise.all(
    storedAccounts().map((account) => {
      if (!account.enabled || !readConfig().enabledProviders[account.provider])
        return disabledAccount(account)
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
      available: openCodeInstalled() && readConfig().enabledProviders.opencode,
    },
  }
}

function disabledAccount(account: StoredAccount): Account {
  return {
    ...account,
    email: null,
    plan: null,
    error: null,
    limits: [],
    linked: true,
    valid: false,
  }
}

export async function publishAccounts() {
  try {
    broadcast({ type: 'accounts', ...(await accounts()) })
  } catch (error) {
    console.warn(`could not list accounts: ${error}`)
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
  const settings = config.models[provider]
  const overrides =
    provider === 'opencode'
      ? {}
      : storedAccount(provider, accountId).hiddenModels
  return {
    ...result,
    defaultModel: defaultModels[provider],
    models: result.models.map((model) => {
      const deprecated = deprecatedModels[provider].includes(model.value)
      const setting = settings[model.value] ?? {
        hidden: deprecated,
        effort: null,
      }
      return {
        ...model,
        deprecated,
        hidden: overrides[model.value] ?? setting.hidden,
        effort: setting.effort,
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
      if (accountId !== null)
        throw new Error(
          'OpenCode has no accounts. Connect providers in OpenCode'
        )
      return openCodeCapabilities(cwd)
  }
}

export function addAccount(
  provider: Exclude<Provider, 'opencode'>,
  name: string,
  configDir: string
) {
  saveAccounts([
    ...storedAccounts(),
    {
      id: randomUUID(),
      provider,
      ...validAccount(name, configDir),
      enabled: true,
      hiddenModels: {},
    },
  ])
}

export async function updateAccount(update: Omit<StoredAccount, 'provider'>) {
  const before = storedAccounts().find((item) => item.id === update.id)
  if (before === undefined) throw new Error('That account was removed')
  const account = validAccount(update.name, update.configDir)
  saveAccounts(
    storedAccounts().map((item) =>
      item.id === update.id
        ? {
            ...item,
            ...account,
            enabled: update.enabled,
            hiddenModels: update.hiddenModels,
          }
        : item
    )
  )
  forgetClaude(update.id)
  if (before.enabled && !update.enabled) await stopAccount(before)
}

export function removeAccount(id: string) {
  saveAccounts(storedAccounts().filter((item) => item.id !== id))
  forgetClaude(id)
}

function validAccount(name: string, configDir: string) {
  if (name.trim() === '') throw new Error('Give the account a name')
  const dir = configDir.trim()
  if (dir === '~' || dir.startsWith('~/'))
    return {
      name: name.trim(),
      configDir: path.join(os.homedir(), dir.slice(1)),
    }
  if (path.isAbsolute(dir)) return { name: name.trim(), configDir: dir }
  throw new Error('Use an absolute config directory or one starting with ~/')
}

function saveAccounts(items: StoredAccount[]) {
  writeJson('accounts.json', items)
}
