import { realpathSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  type EffortLevel,
  type Options,
  type PermissionMode,
  type Query,
  query,
  type SDKControlInitializeResponse,
  type SDKRateLimitInfo,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  Account,
  ProviderCapabilities,
  RateLimit,
  Settings,
} from '@offsite/core/protocol'
import { type StoredAccount, storedAccount } from '../../services/accounts.ts'
import { notifierConnected, sendPush } from '../../services/push.ts'
import { sessions } from '../../services/sessions.ts'
import { claudeBaseDir } from '../../storage/config.ts'
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
  if (effort === undefined) {
    throw new Error(`Claude has no ${value} effort`)
  }
  return effort
}

export function claudeMode(value: string) {
  const mode = modes.find((item) => item === value)
  if (mode === undefined) {
    throw new Error(`Claude has no ${value} mode`)
  }
  return mode
}

export function claudeOptions(accountId: string | null, cwd: string): Options {
  const account = storedAccount('claude', accountId)
  const configDir = account.configDir ?? claudeBaseDir()
  const env: Record<string, string | undefined> = {
    ...process.env,
    CLAUDE_CODE_ENTRYPOINT: 'offsite',
    CLAUDE_CONFIG_DIR: configDir,
  }
  if (path.resolve(configDir) === path.join(os.homedir(), '.claude')) {
    delete env.CLAUDE_CONFIG_DIR
  }
  return {
    cwd,
    env,
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
                !isRecord(input.tool_input) ||
                typeof input.tool_input.message !== 'string'
              ) {
                throw new Error('Unexpected PushNotification hook input')
              }
              const message = input.tool_input.message
              broadcast({
                type: 'notification',
                sessionId: input.session_id,
                message,
              })
              if (notifierConnected()) {
                return {
                  hookSpecificOutput: {
                    hookEventName: 'PostToolUse',
                    updatedToolOutput: {
                      message,
                      localSent: true,
                      disabledReason: 'no_transport',
                    },
                  },
                }
              }
              const session = sessions().find(
                (item) => item.id === input.session_id
              )
              if (session === undefined) {
                throw new Error(`Session ${input.session_id} is not listed`)
              }
              const pushSent = await sendPush({
                kind: 'session',
                title: session.title,
                body: message,
                projectId: session.projectId,
                sessionId: session.id,
              })
              return {
                hookSpecificOutput: {
                  hookEventName: 'PostToolUse',
                  updatedToolOutput: {
                    message,
                    localSent: false,
                    pushSent,
                    ...(pushSent ? {} : { disabledReason: 'no_transport' }),
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

export function runOptions(options: {
  sessionId: string
  cwd: string
  resume: boolean
  resumeAt: string | null
  settings: Settings
}): Options {
  const settings = options.settings
  return {
    ...claudeOptions(settings.accountId, options.cwd),
    ...(options.resume
      ? { resume: options.sessionId }
      : { sessionId: options.sessionId }),
    ...(options.resumeAt === null ? {} : { resumeSessionAt: options.resumeAt }),
    enableFileCheckpointing: true,
    ...(settings.mode === null
      ? {}
      : { permissionMode: claudeMode(settings.mode) }),
    ...(settings.model === null ? {} : { model: settings.model }),
    ...(settings.effort === null
      ? {}
      : { effort: claudeEffort(settings.effort) }),
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
  }
}

export async function claudeCapabilities(
  account: StoredAccount,
  cwd: string
): Promise<ProviderCapabilities> {
  const result = await initialization(account.id, cwd)
  return {
    models: result.models
      .filter((model) => model.value !== 'default')
      .map((model) => {
        if (model.resolvedModel === undefined) {
          throw new Error(`Claude did not resolve the ${model.value} model`)
        }
        return {
          value: model.resolvedModel,
          name: model.displayName,
          description: model.description,
          efforts: model.supportedEffortLevels ?? [],
        }
      }),
    commands: result.commands.map((command) => ({
      name: command.name,
      description: command.description,
      hint: command.argumentHint,
    })),
    agents: [],
  }
}

export async function claudeAccount(account: StoredAccount): Promise<Account> {
  const linked = isLinked(account.configDir ?? claudeBaseDir())
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
  for (const key of probes.keys()) {
    if (key.startsWith(`${accountId}\n`)) {
      probes.delete(key)
    }
  }
  limits.delete(accountId)
}

export function recordLimit(accountId: string, info: SDKRateLimitInfo) {
  const current = limits.get(accountId) ?? new Map<string, RateLimit>()
  const windows = (info as { unifiedWindows?: unknown }).unifiedWindows
  if (isRecord(windows)) {
    for (const [name, value] of Object.entries(windows)) {
      if (isRecord(value)) {
        current.set(name, {
          window: name,
          utilization:
            typeof value.utilization === 'number' ? value.utilization : null,
          resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
          rejected: current.get(name)?.rejected ?? false,
        })
      }
    }
  }
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

async function recordUsage(accountId: string, probe: Query) {
  try {
    const usage =
      await probe.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      })
    if (usage.rate_limits === null) {
      return
    }
    const current = limits.get(accountId) ?? new Map<string, RateLimit>()
    const windows = {
      five_hour: usage.rate_limits.five_hour,
      seven_day: usage.rate_limits.seven_day,
      seven_day_opus: usage.rate_limits.seven_day_opus,
      seven_day_sonnet: usage.rate_limits.seven_day_sonnet,
    }
    for (const [name, window] of Object.entries(windows)) {
      if (window !== undefined && window !== null) {
        current.set(name, {
          window: name,
          utilization:
            window.utilization === null ? null : window.utilization / 100,
          resetsAt:
            window.resets_at === null
              ? null
              : Date.parse(window.resets_at) / 1000,
          rejected: window.utilization !== null && window.utilization >= 100,
        })
      }
    }
    limits.set(accountId, current)
  } catch (error) {
    console.warn(`could not read Claude usage limits: ${error}`)
  }
}

function isLinked(configDir: string) {
  const base = claudeBaseDir()
  try {
    if (realpathSync(configDir) === realpathSync(base)) {
      return true
    }
    return (
      realpathSync(path.join(configDir, 'projects')) ===
      realpathSync(path.join(base, 'projects'))
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function accountLimits(accountId: string) {
  return [...(limits.get(accountId)?.values() ?? [])]
}

function initialization(accountId: string, cwd: string) {
  const key = `${accountId}\n${cwd}`
  const existing = probes.get(key)
  if (existing !== undefined) {
    return existing
  }
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
    const result = await probe.initializationResult()
    await recordUsage(accountId, probe)
    return result
  } finally {
    closed.resolve()
    probe.close()
  }
}

async function* idle(until: Promise<void>): AsyncGenerator<SDKUserMessage> {
  await until
  yield* []
}
