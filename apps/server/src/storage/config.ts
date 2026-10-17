import os from 'node:os'
import path from 'node:path'
import type { Config, ConfigInfo, Platform } from '@offsite/core/protocol'
import { broadcast } from '../lib/hub.ts'
import { home, readJson, writeJson } from './storage.ts'

export const version = '0.0.0'

const configFile = path.join(home, 'config.json')

export const defaults: Config = {
  claudeBaseDir: path.join(os.homedir(), '.claude'),
  enabledProviders: { claude: true, codex: true, opencode: true },
  composer: {
    provider: 'claude',
    claude: {
      accountId: null,
      model: 'haiku',
      effort: 'low',
      mode: 'bypassPermissions',
      plan: false,
    },
    codex: {
      accountId: null,
      model: null,
      effort: null,
      mode: 'auto',
      plan: false,
    },
    opencode: {
      accountId: 'opencode',
      model: null,
      effort: null,
      mode: null,
      plan: false,
    },
  },
  commitMessage: { accountId: null, model: null },
  terminal: {
    shell: { macos: null, linux: null, windows: null },
    behavior: { terminalIdentity: 'offsite', shellIntegration: true },
  },
}

const choices: Record<string, string[]> = {
  'composer.provider': ['claude', 'codex', 'opencode'],
  'composer.claude.effort': ['low', 'medium', 'high', 'xhigh', 'max'],
  'composer.claude.mode': [
    'default',
    'acceptEdits',
    'bypassPermissions',
    'plan',
    'dontAsk',
    'auto',
  ],
  'composer.codex.mode': ['read-only', 'auto', 'full-access'],
  'terminal.behavior.terminalIdentity': ['offsite', 'ghostty', 'iterm2'],
}
const nullable = [
  'composer.claude.accountId',
  'composer.claude.model',
  'composer.claude.effort',
  'composer.claude.mode',
  'composer.codex.accountId',
  'composer.codex.model',
  'composer.codex.effort',
  'composer.codex.mode',
  'composer.opencode.accountId',
  'composer.opencode.model',
  'composer.opencode.effort',
  'composer.opencode.mode',
  'commitMessage.accountId',
  'commitMessage.model',
  'terminal.shell.macos',
  'terminal.shell.linux',
  'terminal.shell.windows',
]

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
    version,
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
  if (!isObject(user)) {
    console.warn(`${configFile} is not an object, using the default config`)
    return structuredClone(defaults)
  }
  delete user.commitModels
  let config: unknown = structuredClone(defaults)
  for (const [key, value] of Object.entries(user))
    config = merge(config, [key], value)
  return config as Config
}

export function saveConfig(value: unknown) {
  const error = invalid(value, defaults, [])
  if (error !== null) throw new Error(error)
  writeJson('config.json', value)
  process.env.CLAUDE_CONFIG_DIR = (value as Config).claudeBaseDir
  broadcast({ type: 'config', config: value as Config })
  return value as Config
}

function merge(config: unknown, keys: string[], user: unknown): unknown {
  const template = keys.reduce<unknown>(
    (value, key) => (isObject(value) ? value[key] : undefined),
    config
  )
  if (isObject(template) && isObject(user)) {
    let next = config
    for (const [key, value] of Object.entries(user))
      next = merge(next, [...keys, key], value)
    return next
  }
  const candidate = structuredClone(config) as Record<string, unknown>
  const parent = keys
    .slice(0, -1)
    .reduce((value, key) => value[key] as Record<string, unknown>, candidate)
  parent[keys[keys.length - 1]] = user
  const error = invalid(candidate, defaults, [])
  if (error === null) return candidate
  console.warn(
    `invalid ${keys.join('.')} in ${configFile}, using its default: ${error}`
  )
  return config
}

function invalid(
  value: unknown,
  template: unknown,
  keys: string[]
): string | null {
  const name = keys.join('.')
  if (isObject(template)) {
    if (!isObject(value)) return `${name || 'config'} must be an object`
    for (const key of Object.keys(value))
      if (!(key in template))
        return `unknown setting ${[...keys, key].join('.')}`
    for (const key of Object.keys(template)) {
      if (!(key in value)) return `missing setting ${[...keys, key].join('.')}`
      const error = invalid(value[key], template[key], [...keys, key])
      if (error !== null) return error
    }
    return null
  }
  if (nullable.includes(name) && value === null) return null
  if (name === 'claudeBaseDir')
    return typeof value === 'string' && path.isAbsolute(value)
      ? null
      : 'claudeBaseDir must be an absolute path'
  if (name in choices) {
    if (choices[name].includes(value as string)) return null
    return `${name} must be one of ${choices[name].join(', ')}`
  }
  if (template === null) {
    if (typeof value === 'string') return null
    return `${name} must be text or null`
  }
  if (typeof value !== typeof template)
    return `${name} must be a ${typeof template}`
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
