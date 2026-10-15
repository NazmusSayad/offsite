import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  type Options,
  query,
  type SDKControlInitializeResponse,
  type SDKRateLimitInfo,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { broadcast } from './hub.ts'
import type { Account, Capabilities, RateLimit } from './protocol.ts'
import { readJson, writeJson } from './storage.ts'

type StoredAccount = { id: string; name: string; configDir: string }

const probes = new Map<string, Promise<SDKControlInitializeResponse>>()
const limits = new Map<string, Map<string, RateLimit>>()
let executable = ''

export function findClaude() {
  const name = process.platform === 'win32' ? 'claude.exe' : 'claude'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      executable = candidate
      return candidate
    }
  }
  return null
}

export function claudeOptions(accountId: string | null, cwd: string): Options {
  if (accountId === null)
    throw new Error('Add a Claude account in Settings → Accounts')
  const account = storedAccounts().find((item) => item.id === accountId)
  if (account === undefined) throw new Error('That account was removed')
  return {
    cwd,
    env: {
      ...process.env,
      CLAUDE_CODE_ENTRYPOINT: 'offsite',
      CLAUDE_CONFIG_DIR: account.configDir,
    },
    pathToClaudeCodeExecutable: executable,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    hooks: {
      PostToolUse: [
        {
          matcher: 'PushNotification',
          hooks: [
            async (input) => {
              if (
                input.hook_event_name !== 'PostToolUse' ||
                typeof input.tool_input !== 'object' ||
                input.tool_input === null ||
                !('message' in input.tool_input) ||
                typeof input.tool_input.message !== 'string'
              )
                throw new Error('Unexpected PushNotification hook input')
              broadcast({
                type: 'notification',
                sessionId: input.session_id,
                message: input.tool_input.message,
              })
              return {
                hookSpecificOutput: {
                  hookEventName: 'PostToolUse',
                  updatedToolOutput: {
                    message: input.tool_input.message,
                    localSent: true,
                    disabledReason: 'no_transport',
                  },
                },
              }
            },
          ],
        },
      ],
    },
  }
}

export async function capabilities(
  accountId: string,
  cwd: string
): Promise<Capabilities> {
  const result = await initialization(accountId, cwd)
  return {
    models: result.models.map((model) => ({
      value: model.value,
      name: model.displayName,
      description: model.description,
      efforts: model.supportedEffortLevels ?? [],
    })),
    commands: result.commands.map((command) => ({
      name: command.name,
      description: command.description,
      hint: command.argumentHint,
    })),
  }
}

export async function accounts(): Promise<Account[]> {
  return Promise.all(
    storedAccounts().map(async (account) => {
      try {
        const info = (await initialization(account.id, os.homedir())).account
        return {
          ...account,
          email: info.email ?? null,
          plan: info.subscriptionType ?? null,
          error: null,
          limits: accountLimits(account.id),
        }
      } catch (error) {
        return {
          ...account,
          email: null,
          plan: null,
          error: error instanceof Error ? error.message : String(error),
          limits: accountLimits(account.id),
        }
      }
    })
  )
}

export function addAccount(name: string, configDir: string) {
  saveAccounts([
    ...storedAccounts(),
    { id: randomUUID(), ...validAccount(name, configDir) },
  ])
}

export function updateAccount(id: string, name: string, configDir: string) {
  const account = validAccount(name, configDir)
  saveAccounts(
    storedAccounts().map((item) => (item.id === id ? { id, ...account } : item))
  )
  forget(id)
}

export function removeAccount(id: string) {
  saveAccounts(storedAccounts().filter((item) => item.id !== id))
  forget(id)
}

export function recordLimit(accountId: string, info: SDKRateLimitInfo) {
  const current = limits.get(accountId) ?? new Map<string, RateLimit>()
  const windows = (info as { unifiedWindows?: unknown }).unifiedWindows
  if (isRecord(windows))
    for (const [name, value] of Object.entries(windows))
      if (isRecord(value))
        current.set(name, {
          window: name,
          utilization:
            typeof value.utilization === 'number' ? value.utilization : null,
          resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
          rejected: current.get(name)?.rejected ?? false,
        })
  if (info.rateLimitType !== undefined) {
    const existing = current.get(info.rateLimitType)
    current.set(info.rateLimitType, {
      window: info.rateLimitType,
      utilization: info.utilization ?? existing?.utilization ?? null,
      resetsAt: info.resetsAt ?? existing?.resetsAt ?? null,
      rejected: info.status === 'rejected',
    })
  }
  limits.set(accountId, current)
  return accountLimits(accountId)
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

function forget(accountId: string) {
  for (const key of probes.keys())
    if (key.startsWith(`${accountId}\n`)) probes.delete(key)
  limits.delete(accountId)
}

function accountLimits(accountId: string) {
  return [...(limits.get(accountId)?.values() ?? [])]
}

function initialization(accountId: string, cwd: string) {
  const key = `${accountId}\n${cwd}`
  const existing = probes.get(key)
  if (existing !== undefined) return existing
  const probe = runProbe(accountId, cwd)
  probes.set(key, probe)
  probe.catch(() => probes.delete(key))
  return probe
}

async function runProbe(accountId: string, cwd: string) {
  const closed = Promise.withResolvers<void>()
  const probe = query({
    prompt: idle(closed.promise),
    options: claudeOptions(accountId, cwd),
  })
  try {
    return await probe.initializationResult()
  } finally {
    closed.resolve()
    probe.close()
  }
}

async function* idle(until: Promise<void>): AsyncGenerator<SDKUserMessage> {
  await until
  yield* []
}

function storedAccounts() {
  return (readJson('accounts.json') as StoredAccount[] | null) ?? []
}

function saveAccounts(items: StoredAccount[]) {
  writeJson('accounts.json', items)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
