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

const configSchema: z.ZodType<Config> = z.strictObject({
  claudeBaseDir: z
    .string()
    .refine((value) => path.isAbsolute(value), 'must be an absolute path')
    .default(path.join(os.homedir(), '.claude')),
  enabledProviders: z
    .strictObject({
      claude: z.boolean().default(true),
      codex: z.boolean().default(true),
      opencode: z.boolean().default(true),
    })
    .prefault({}),
  composer: z
    .strictObject({
      provider: z.enum(['claude', 'codex', 'opencode']).default('claude'),
      claude: z
        .strictObject({
          accountId: z.string().nullable().default(null),
          model: z.string().nullable().default(null),
          effort: z
            .enum(['low', 'medium', 'high', 'xhigh', 'max'])
            .nullable()
            .default(null),
          mode: z
            .enum([
              'default',
              'acceptEdits',
              'bypassPermissions',
              'plan',
              'dontAsk',
              'auto',
            ])
            .nullable()
            .default('bypassPermissions'),
          plan: z.boolean().default(false),
        })
        .prefault({}),
      codex: z
        .strictObject({
          accountId: z.string().nullable().default(null),
          model: z.string().nullable().default(null),
          effort: z.string().nullable().default(null),
          mode: z
            .enum(['read-only', 'auto', 'full-access'])
            .nullable()
            .default('auto'),
          plan: z.boolean().default(false),
        })
        .prefault({}),
      opencode: z
        .strictObject({
          accountId: z.null().default(null),
          model: z.string().nullable().default(null),
          effort: z.string().nullable().default(null),
          mode: z.string().nullable().default(null),
          plan: z.boolean().default(false),
        })
        .prefault({}),
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
  autoResolve: z
    .strictObject({
      questions: z.number().positive().nullable().default(3),
      permissions: z.number().positive().nullable().default(1),
      permissionDecision: z.enum(['allow', 'deny']).default('allow'),
    })
    .prefault({}),
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
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'linux') return 'linux'
  if (process.platform === 'win32') return 'windows'
  throw new Error(`unsupported platform ${process.platform}`)
}

export function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC ?? 'cmd.exe'
  return os.userInfo().shell ?? '/bin/sh'
}

export function configInfo(): ConfigInfo {
  return {
    config: readConfig(),
    defaults,
    platform: platform(),
    defaultShell: defaultShell(),
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
  if (user === null) return structuredClone(defaults)
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
  if (!result.success) throw new Error(z.prettifyError(result.error))
  writeJson('config.json', result.data)
  process.env.CLAUDE_CONFIG_DIR = result.data.claudeBaseDir
  broadcast({ type: 'config', config: result.data })
  return result.data
}
