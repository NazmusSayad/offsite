import os from 'node:os'
import path from 'node:path'
import type { Config, ConfigInfo, Platform } from '@offsite/core/protocol'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { home, readJson, writeJson } from './storage.ts'

const configFile = path.join(home, 'config.json')

const modelSetting = z.strictObject({
  hidden: z.boolean(),
  effort: z.string().nullable(),
})

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

function accountSchema(provider: 'claude' | 'codex') {
  return z.strictObject({
    id: z.string(),
    provider: z.literal(provider),
    name: z.string(),
    configDir: platformDirs,
    enabled: z.boolean().default(true),
    hiddenModels: z.record(z.string(), z.boolean()).default({}),
  })
}

const configSchema: z.ZodType<Config> = z.strictObject({
  claudeBaseDir: platformDirs,
  claudeAccounts: z.array(accountSchema('claude')).default([]),
  codexAccounts: z.array(accountSchema('codex')).default([]),
  enabledProviders: z
    .strictObject({
      claude: z.boolean().default(true),
      codex: z.boolean().default(true),
      opencode: z.boolean().default(true),
    })
    .prefault({}),
  commitMessage: z
    .strictObject({
      provider: z
        .enum(['claude', 'codex', 'opencode'])
        .nullable()
        .default(null),
      accountId: z.string().nullable().default(null),
      model: z.string().nullable().default(null),
    })
    .prefault({}),
  models: z
    .strictObject({
      claude: z.record(z.string(), modelSetting).default({}),
      codex: z.record(z.string(), modelSetting).default({}),
      opencode: z.record(z.string(), modelSetting).default({}),
    })
    .prefault({}),
  delivery: z.enum(['queue', 'steer']).default('steer'),
  autoSkipQuestionTimeout: z.number().positive().nullable().default(180),
  autoPermissionMode: z.enum(['allow', 'deny']).default('allow'),
  autoPermissionTimeout: z.number().positive().nullable().default(15),
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
    readConfig().claudeBaseDir[platform()] ?? path.join(os.homedir(), '.claude')
  )
}

export function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC ?? 'cmd.exe'
  }
  return os.userInfo().shell ?? '/bin/sh'
}

export function configInfo(): ConfigInfo {
  return {
    config: readConfig(),
    defaults,
    platform: platform(),
    defaultShell: defaultShell(),
    defaultClaudeBaseDir: path.join(os.homedir(), '.claude'),
  }
}

export function readConfig() {
  let user: unknown
  try {
    user = readJson('config.json')
  } catch (error) {
    console.warn(`invalid ${configFile}, using the default config: ${error}`)
    return structuredClone(defaults)
  }
  if (user === null) {
    return structuredClone(defaults)
  }
  const result = configSchema.safeParse(user)
  if (!result.success) {
    console.warn(
      `invalid ${configFile}, using the default config:\n${z.prettifyError(result.error)}`
    )
    return structuredClone(defaults)
  }
  return result.data
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
