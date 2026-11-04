import { readFileSync, realpathSync, statSync } from 'node:fs'
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
import type { SessionSettings } from '@offsite/core/config'
import type {
  Account,
  ProviderCapabilities,
  RateLimit,
} from '@offsite/core/providers'
import { type StoredAccount, storedAccount } from '../../services/accounts.ts'
import { openEnv } from '../../services/open/open.ts'
import { notifierConnected, sendPush } from '../../services/push.ts'
import { sessions } from '../../services/sessions.ts'
import { claudeBaseDir } from '../../storage/config.ts'
import { broadcast } from '../hub.ts'
import { logger } from '../log.ts'
import { isRecord } from './content.ts'

const log = logger.withTag('claude')

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
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Project folder ${cwd} does not exist`)
  }
  const account = storedAccount('claude', accountId)
  const configDir = account.configDir ?? claudeBaseDir()
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...openEnv(),
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
  settings: SessionSettings
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
  const configDir = account.configDir ?? claudeBaseDir()
  const linked = isLinked(configDir)
  try {
    const info = (await initialization(account.id, os.homedir())).account
    return {
      ...account,
      email: info.email ?? null,
      displayName: claudeDisplayName(configDir),
      organization: info.organization ?? null,
      plan: info.subscriptionType ?? null,
      error: null,
      linked,
      valid: linked,
    }
  } catch (error) {
    return {
      ...account,
      email: null,
      displayName: null,
      organization: null,
      plan: null,
      error: error instanceof Error ? error.message : String(error),
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
}

export function eventLimits(info: SDKRateLimitInfo, current: RateLimit[]) {
  const changed = new Map<string, RateLimit>()
  const windows = (info as { unifiedWindows?: unknown }).unifiedWindows
  if (isRecord(windows)) {
    for (const [name, value] of Object.entries(windows)) {
      if (isRecord(value)) {
        changed.set(name, {
          window: name,
          utilization:
            typeof value.utilization === 'number' ? value.utilization : null,
          resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
          rejected:
            current.find((limit) => limit.window === name)?.rejected ?? false,
        })
      }
    }
  }
  if (info.rateLimitType !== undefined) {
    const existing =
      changed.get(info.rateLimitType) ??
      current.find((limit) => limit.window === info.rateLimitType)
    changed.set(info.rateLimitType, {
      window: info.rateLimitType,
      utilization: info.utilization ?? existing?.utilization ?? null,
      resetsAt: info.resetsAt ?? existing?.resetsAt ?? null,
      rejected: info.status === 'rejected',
    })
  }
  return [...changed.values()]
}

export async function claudeLimits(account: StoredAccount) {
  const closed = Promise.withResolvers<void>()
  const probe = query({
    prompt: idle(closed.promise),
    options: claudeOptions(account.id, os.homedir()),
  })
  try {
    await probe.initializationResult()
    const usage =
      await probe.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      })
    if (usage.rate_limits === null) {
      return []
    }
    const windows = [
      { name: 'five_hour', window: usage.rate_limits.five_hour },
      { name: 'seven_day', window: usage.rate_limits.seven_day },
      { name: 'seven_day_opus', window: usage.rate_limits.seven_day_opus },
      { name: 'seven_day_sonnet', window: usage.rate_limits.seven_day_sonnet },
      ...(usage.rate_limits.model_scoped ?? []).map((row) => ({
        name: row.display_name,
        window: row,
      })),
    ]
    return windows.flatMap((entry): RateLimit[] => {
      const window = entry.window
      if (window === undefined || window === null) {
        return []
      }
      return [
        {
          window: entry.name,
          utilization:
            window.utilization === null ? null : window.utilization / 100,
          resetsAt:
            window.resets_at === null
              ? null
              : Date.parse(window.resets_at) / 1000,
          rejected: window.utilization !== null && window.utilization >= 100,
        },
      ]
    })
  } finally {
    closed.resolve()
    probe.close()
  }
}

function claudeDisplayName(configDir: string) {
  const file =
    path.resolve(configDir) === path.join(os.homedir(), '.claude')
      ? path.join(os.homedir(), '.claude.json')
      : path.join(configDir, '.claude.json')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn(`could not read the Claude account name:`, error)
    }
    return null
  }
  if (
    !isRecord(raw) ||
    !isRecord(raw.oauthAccount) ||
    typeof raw.oauthAccount.displayName !== 'string'
  ) {
    return null
  }
  const name = raw.oauthAccount.displayName.trim()
  return name === '' ? null : name
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
