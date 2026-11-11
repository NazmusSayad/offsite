import os from 'node:os'
import path from 'node:path'
import type { Config, ConfigWithDefaults, Platform } from '@offsite/core/config'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { readSettings, scratchAvailable, writeJson } from './storage.ts'

const modelSetting = z.strictObject({
  hidden: z.boolean(),
})

const generationModel = z
  .strictObject({
    provider: z.enum(['claude', 'codex', 'opencode']).nullable().default(null),
    accountId: z.string().nullable().default(null),
    model: z.string().nullable().default(null),
  })
  .prefault({})

const posixDir = z
  .string()
  .refine((value) => path.posix.isAbsolute(value), 'must be an absolute path')
  .nullable()
  .default(null)

const platformDirs = z
  .strictObject({
    macos: posixDir,
    linux: posixDir,
    windows: z
      .string()
      .refine(
        (value) => path.win32.isAbsolute(value),
        'must be an absolute path'
      )
      .nullable()
      .default(null),
  })
  .prefault({})

function workingDir(isAbsolute: (value: string) => boolean) {
  return z
    .string()
    .refine(
      (value) => value === '~' || value.startsWith('~/') || isAbsolute(value),
      'must be an absolute path or start with ~'
    )
    .nullable()
    .default(null)
}

function accountSchema(provider: 'claude' | 'codex') {
  return z.strictObject({
    id: z.string(),
    provider: z.literal(provider),
    name: z.string(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i, 'must be a hex color like #3b82f6')
      .nullable()
      .default(null),
    configDir: platformDirs,
    enabled: z.boolean().default(true),
  })
}

const modelSettings = z.record(z.string(), modelSetting).default({})

const configSchema: z.ZodType<Config> = z.strictObject({
  version: z.literal(2).default(2),
  claude: z
    .strictObject({
      enabled: z.boolean().default(true),
      baseDir: platformDirs,
      accounts: z.array(accountSchema('claude')).default([]),
      models: modelSettings,
    })
    .prefault({}),
  codex: z
    .strictObject({
      enabled: z.boolean().default(true),
      accounts: z.array(accountSchema('codex')).default([]),
      models: modelSettings,
    })
    .prefault({}),
  opencode: z
    .strictObject({
      enabled: z.boolean().default(true),
      models: modelSettings,
    })
    .prefault({}),
  workingDir: z
    .strictObject({
      macos: workingDir(path.posix.isAbsolute),
      linux: workingDir(path.posix.isAbsolute),
      windows: workingDir(path.win32.isAbsolute),
    })
    .prefault({}),
  commitMessage: generationModel,
  titleGeneration: generationModel,
  delivery: z.enum(['queue', 'steer']).default('steer'),
  autoSkipQuestionTimeout: z.number().positive().nullable().default(180),
  autoPermissionMode: z.enum(['bypass', 'allow', 'deny']).default('bypass'),
  autoPermissionTimeout: z.number().positive().nullable().default(15),
  offsiteSkills: z.boolean().default(true),
  terminal: z
    .strictObject({
      shell: z
        .strictObject({
          macos: z.string().nullable().default(null),
          linux: z.string().nullable().default(null),
          windows: z.string().nullable().default(null),
        })
        .prefault({}),
      behavior: z
        .strictObject({
          terminalIdentity: z
            .enum(['offsite', 'ghostty', 'iterm2'])
            .default('offsite'),
          shellIntegration: z.boolean().default(true),
        })
        .prefault({}),
    })
    .prefault({}),
  dictation: z
    .strictObject({
      workflowId: z.string().nullable().default(null),
    })
    .prefault({}),
})

export const defaults = configSchema.parse({})

export function platform(): Platform {
  if (process.platform === 'darwin') {
    return 'macos'
  }
  if (process.platform === 'linux') {
    return 'linux'
  }
  if (process.platform === 'win32') {
    return 'windows'
  }
  throw new Error(`unsupported platform ${process.platform}`)
}

export function claudeBaseDir() {
  return (
    readConfig().claude.baseDir[platform()] ??
    path.join(os.homedir(), '.claude')
  )
}

export function workingDirectory() {
  const dir = readConfig().workingDir[platform()] ?? '~'
  return dir.startsWith('~') ? path.join(os.homedir(), dir.slice(1)) : dir
}

export function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'cmd.exe'
  }
  return os.userInfo().shell ?? '/bin/sh'
}

export function configInfo(): ConfigWithDefaults {
  return {
    config: readConfig(),
    defaults,
    platform: platform(),
    defaultShell: defaultShell(),
    defaultClaudeBaseDir: path.join(os.homedir(), '.claude'),
    homeDir: os.homedir(),
    scratchAvailable,
    version: process.env.OFFSITE_VERSION ?? 'dev',
  }
}

export function readConfig() {
  return readSettings('config.json', configSchema, defaults, migrate)
}

function migrate(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }
  if (!('version' in value)) {
    return fromVersion1(value)
  }
  if (value.version === 2) {
    return value
  }
  throw new Error(
    `config.json has version ${String(value.version)}, which this version of offsite cannot read. Update offsite`
  )
}

function fromVersion1(value: object) {
  const {
    claudeBaseDir,
    claudeAccounts,
    codexAccounts,
    enabledProviders,
    models,
    ...rest
  } = value as Record<string, unknown>
  const enabled = (enabledProviders ?? {}) as Record<string, unknown>
  const providerModels = (models ?? {}) as Record<string, unknown>
  return {
    ...rest,
    version: 2,
    claude: {
      enabled: enabled.claude,
      baseDir: claudeBaseDir,
      accounts: claudeAccounts,
      models: providerModels.claude,
    },
    codex: {
      enabled: enabled.codex,
      accounts: codexAccounts,
      models: providerModels.codex,
    },
    opencode: {
      enabled: enabled.opencode,
      models: providerModels.opencode,
    },
  }
}

export function saveConfig(value: unknown) {
  const result = configSchema.safeParse(value)
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  writeJson('config.json', result.data)
  process.env.CLAUDE_CONFIG_DIR = claudeBaseDir()
  broadcast({ type: 'config', config: result.data })
  return result.data
}
