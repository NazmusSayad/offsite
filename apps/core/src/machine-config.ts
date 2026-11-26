import { type InputConfigLayer, LayeredConfig } from '@offsite/config'
import { z } from 'zod'
import { CODEX_MODES, type Config } from './config.ts'

function isPosixAbsolute(value: string) {
  return value.startsWith('/')
}

function isWindowsAbsolute(value: string) {
  return /^([a-z]:)?[\\/]/i.test(value)
}

const modelSetting = z.strictObject({
  hidden: z.boolean(),
})

const posixDir = z
  .string()
  .refine(isPosixAbsolute, 'must be an absolute path')
  .nullable()
  .default(null)

const platformDirs = z
  .strictObject({
    macos: posixDir,
    linux: posixDir,
    windows: z
      .string()
      .refine(isWindowsAbsolute, 'must be an absolute path')
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

const smallModel = z.string().nullable().default(null)

const configSchema: z.ZodType<Config> = z.strictObject({
  version: z.literal(4).default(4),
  claude: z
    .strictObject({
      enabled: z.boolean().default(true),
      baseDir: platformDirs,
      accounts: z.array(accountSchema('claude')).default([]),
      models: modelSettings,
      smallModel,
    })
    .prefault({}),
  codex: z
    .strictObject({
      enabled: z.boolean().default(true),
      accounts: z.array(accountSchema('codex')).default([]),
      models: modelSettings,
      smallModel,
      sideQuestMode: z.enum(CODEX_MODES).default('read-only'),
    })
    .prefault({}),
  opencode: z
    .strictObject({
      enabled: z.boolean().default(true),
      models: modelSettings,
      smallModel,
    })
    .prefault({}),
  workingDir: z
    .strictObject({
      macos: workingDir(isPosixAbsolute),
      linux: workingDir(isPosixAbsolute),
      windows: workingDir(isWindowsAbsolute),
    })
    .prefault({}),
  delivery: z.enum(['queue', 'steer']).default('steer'),
  autoSkipQuestionTimeout: z.number().positive().nullable().default(120),
  autoPermissionMode: z.enum(['bypass', 'allow', 'deny']).default('bypass'),
  autoPermissionTimeout: z.number().positive().nullable().default(15),
  offsiteSkills: z.boolean().default(true),
  autoTitle: z.boolean().default(true),
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
  finishedCheck: z
    .strictObject({
      openRouterModel: z.string().min(1).nullable().default(null),
      openRouterKeyEnv: z.string().min(1).nullable().default(null),
    })
    .prefault({}),
})

export function createMachineConfig(layers: InputConfigLayer[]) {
  return new LayeredConfig(configSchema, layers)
}
