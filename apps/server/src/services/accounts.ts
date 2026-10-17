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
import { disconnectOpenCode } from '../lib/opencode/client.ts'
import {
  openCodeCapabilities,
  openCodeInstalled,
} from '../lib/opencode/index.ts'
import { platform, readConfig, saveConfig } from '../storage/config.ts'

export type StoredAccount = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  configDir: string | null
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
  const config = readConfig()
  return [
    ...config.claudeAccounts.map((item) => ({
      ...item,
      configDir: item.configDir[platform()],
    })),
    ...config.codexAccounts.map((item) => ({
      ...item,
      configDir: item.configDir[platform()],
    })),
  ]
}

export function assertEnabled(provider: Provider, accountId: string | null) {
  if (!readConfig().enabledProviders[provider]) {
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
      if (
        !account.enabled ||
        !readConfig().enabledProviders[account.provider]
      ) {
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
        hidden: overrides[model.value] ?? setting.hidden,
        effort: setting.effort ?? effort,
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
  const key = `${provider}Accounts` as const
  saveConfig({
    ...config,
    [key]: [
      ...config[key],
      {
        id: randomUUID(),
        provider,
        name: account.name,
        configDir: { [platform()]: account.configDir },
        enabled: true,
        hiddenModels: {},
      },
    ],
  })
}

export async function updateAccount(update: Omit<StoredAccount, 'provider'>) {
  const before = storedAccounts().find((item) => item.id === update.id)
  if (before === undefined) {
    throw new Error('That account was removed')
  }
  const account = validAccount(update.name, update.configDir)
  const config = readConfig()
  const key = `${before.provider}Accounts` as const
  saveConfig({
    ...config,
    [key]: config[key].map((item) =>
      item.id === update.id
        ? {
            ...item,
            name: account.name,
            configDir: { ...item.configDir, [platform()]: account.configDir },
            enabled: update.enabled,
            hiddenModels: update.hiddenModels,
          }
        : item
    ),
  })
  forgetClaude(update.id)
  if (before.enabled && !update.enabled) {
    await stopAccount(before)
  }
}

export function removeAccount(id: string) {
  const config = readConfig()
  saveConfig({
    ...config,
    claudeAccounts: config.claudeAccounts.filter((item) => item.id !== id),
    codexAccounts: config.codexAccounts.filter((item) => item.id !== id),
  })
  forgetClaude(id)
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
