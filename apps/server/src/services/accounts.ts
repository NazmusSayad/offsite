import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type { Account, Capabilities, Provider } from '@offsite/core/protocol'
import {
  claudeAccount,
  claudeCapabilities,
  forgetClaude,
} from '../lib/claude/index.ts'
import { codexAccount, codexCapabilities } from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import {
  openCodeAccount,
  openCodeCapabilities,
  openCodeInstalled,
} from '../lib/opencode/index.ts'
import { readJson, writeJson } from '../storage/storage.ts'

export type StoredAccount = {
  id: string
  provider: Provider
  name: string
  configDir: string
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
  return (readJson('accounts.json') as StoredAccount[] | null) ?? []
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

export async function accounts(): Promise<Account[]> {
  const stored = await Promise.all(
    storedAccounts().map((account) => {
      switch (account.provider) {
        case 'claude':
          return claudeAccount(account)
        case 'codex':
          return codexAccount(account)
        case 'opencode':
          throw new Error('OpenCode has no stored accounts')
      }
    })
  )
  return openCodeInstalled() ? [...stored, openCodeAccount()] : stored
}

export async function publishAccounts() {
  try {
    broadcast({ type: 'accounts', accounts: await accounts() })
  } catch (error) {
    console.warn(`could not list accounts: ${error}`)
  }
}

export function capabilities(
  accountId: string,
  cwd: string
): Promise<Capabilities> {
  if (accountId === openCodeAccount().id) return openCodeCapabilities(cwd)
  const account = storedAccounts().find((item) => item.id === accountId)
  if (account === undefined) throw new Error('That account was removed')
  switch (account.provider) {
    case 'claude':
      return claudeCapabilities(account, cwd)
    case 'codex':
      return codexCapabilities(account, cwd)
    case 'opencode':
      throw new Error('OpenCode has no stored accounts')
  }
}

export function addAccount(
  provider: Provider,
  name: string,
  configDir: string
) {
  if (provider === 'opencode')
    throw new Error('OpenCode has no accounts. Connect providers in OpenCode')
  saveAccounts([
    ...storedAccounts(),
    { id: randomUUID(), provider, ...validAccount(name, configDir) },
  ])
}

export function updateAccount(id: string, name: string, configDir: string) {
  const account = validAccount(name, configDir)
  saveAccounts(
    storedAccounts().map((item) =>
      item.id === id ? { ...item, ...account } : item
    )
  )
  forgetClaude(id)
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
