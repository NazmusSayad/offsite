import os from 'node:os'
import path from 'node:path'
import { broadcast } from './hub.ts'
import type { Config, ConfigInfo, Platform } from './protocol.ts'
import { schemes } from './schemes.ts'
import { home, readJson, writeJson } from './storage.ts'

export const version = '0.0.0'

const configFile = path.join(home, 'config.json')

export const defaults: Config = {
  theme: schemes[0].id,
  claudeBaseDir: path.join(os.homedir(), '.claude'),
  composer: {
    accountId: null,
    model: 'haiku',
    effort: 'low',
    permissionMode: 'bypassPermissions',
  },
  terminal: {
    shell: { macos: null, linux: null, windows: null },
    font: {
      family: 'FiraCode Nerd Font',
      size: 14,
      lineHeight: 1.35,
      ligatures: true,
    },
    cursor: { style: 'bar', blink: true },
    padding: { top: 4, right: 4, bottom: 0, left: 4 },
    scrollback: 1000,
    boldIsBright: true,
    behavior: {
      modernizeShiftEnter: true,
      pasteBrowserImages: true,
      captureShortcuts: true,
      bellFlash: true,
      bellSound: true,
      terminalIdentity: 'offsite',
      shellIntegration: true,
      clickToMoveCursor: true,
      optionAsMeta: 'off',
      confirmCloseBusyTab: true,
    },
  },
  diff: { split: false, wrap: true },
}

const choices: Record<string, string[]> = {
  theme: schemes.map((scheme) => scheme.id),
  'composer.effort': ['low', 'medium', 'high', 'xhigh', 'max'],
  'composer.permissionMode': [
    'default',
    'acceptEdits',
    'bypassPermissions',
    'plan',
    'dontAsk',
    'auto',
  ],
  'terminal.cursor.style': ['block', 'bar', 'underline'],
  'terminal.behavior.terminalIdentity': ['offsite', 'ghostty', 'iterm2'],
  'terminal.behavior.optionAsMeta': ['off', 'left', 'right', 'both'],
}
const nullable = [
  'composer.accountId',
  'composer.model',
  'composer.effort',
  'composer.permissionMode',
  'terminal.shell.macos',
  'terminal.shell.linux',
  'terminal.shell.windows',
]
const integers = [
  'terminal.scrollback',
  'terminal.padding.top',
  'terminal.padding.right',
  'terminal.padding.bottom',
  'terminal.padding.left',
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
  if (typeof value !== 'number') return null
  if (!Number.isFinite(value) || value < 0)
    return `${name} must be a number of at least 0`
  if (integers.includes(name) && !Number.isInteger(value))
    return `${name} must be a whole number`
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
