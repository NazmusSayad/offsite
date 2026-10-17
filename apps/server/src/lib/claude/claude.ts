import { realpathSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  type EffortLevel,
  type Options,
  type PermissionMode,
  query,
  type SDKControlInitializeResponse,
  type SDKRateLimitInfo,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { Account, Capabilities, RateLimit } from '@offsite/core/protocol'
import { type StoredAccount, storedAccount } from '../../services/accounts.ts'
import { readConfig } from '../../storage/config.ts'
import { broadcast } from '../hub.ts'
import { isRecord } from './content.ts'

const efforts: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
const modes: PermissionMode[] = [
  'default',
  'acceptEdits',
  'bypassPermissions',
  'plan',
  'dontAsk',
  'auto',
]
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

export function claudeEffort(value: string) {
  const effort = efforts.find((item) => item === value)
  if (effort === undefined) throw new Error(`Claude has no ${value} effort`)
  return effort
}

export function claudeMode(value: string) {
  const mode = modes.find((item) => item === value)
  if (mode === undefined) throw new Error(`Claude has no ${value} mode`)
  return mode
}

export function claudeOptions(accountId: string | null, cwd: string): Options {
  const account = storedAccount('claude', accountId)
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

export async function claudeCapabilities(
  account: StoredAccount,
  cwd: string
): Promise<Capabilities> {
  const result = await initialization(account.id, cwd)
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
    agents: [],
  }
}

export async function claudeAccount(account: StoredAccount): Promise<Account> {
  const linked = isLinked(account.configDir)
  try {
    const info = (await initialization(account.id, os.homedir())).account
    return {
      ...account,
      email: info.email ?? null,
      plan: info.subscriptionType ?? null,
      error: null,
      limits: accountLimits(account.id),
      linked,
      valid: linked,
    }
  } catch (error) {
    return {
      ...account,
      email: null,
      plan: null,
      error: error instanceof Error ? error.message : String(error),
      limits: accountLimits(account.id),
      linked,
      valid: linked,
    }
  }
}

export function forgetClaude(accountId: string) {
  for (const key of probes.keys())
    if (key.startsWith(`${accountId}\n`)) probes.delete(key)
  limits.delete(accountId)
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

function isLinked(configDir: string) {
  const base = readConfig().claudeBaseDir
  try {
    if (realpathSync(configDir) === realpathSync(base)) return true
    return (
      realpathSync(path.join(configDir, 'projects')) ===
      realpathSync(path.join(base, 'projects'))
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
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
