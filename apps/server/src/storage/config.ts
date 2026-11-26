import { watch } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { StateDroppedValue } from '@offsite/config'
import type { ConfigWithDefaults, Platform } from '@offsite/core/config'
import { createMachineConfig } from '@offsite/core/machine-config'
import { broadcast } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { home, readJson, writeJson } from './storage.ts'

const log = logger.withTag('config')

type ConfigMeta = { source: 'file' }

const files = ['config.json', 'config.local.json']
let machine: ReturnType<typeof createMachineConfig<ConfigMeta>> | undefined
let lastWarning = ''

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
    defaults: machineConfig().defaults,
    platform: platform(),
    defaultShell: defaultShell(),
    defaultClaudeBaseDir: path.join(os.homedir(), '.claude'),
    homeDir: os.homedir(),
    version: process.env.OFFSITE_VERSION ?? 'dev',
  }
}

export function readConfig() {
  return machineConfig().value
}

function machineConfig() {
  if (machine !== undefined) {
    return machine
  }
  machine = createMachineConfig<ConfigMeta>(
    files.map((name) => ({ key: name, value: startingLayer(name) }))
  )
  warnDropped(machine.dropped)
  machine.on('beforeUpdate', (update) => {
    if (update.meta?.source === 'file') {
      return
    }
    for (const layer of update.changed) {
      writeJson(layer.key, layer.value)
    }
  })
  machine.on('update', (update) => {
    warnDropped(update.dropped)
    process.env.CLAUDE_CONFIG_DIR = claudeBaseDir()
    broadcast({ type: 'config', config: update.value })
  })
  return machine
}

export function watchConfig() {
  watch(home, (_event, name) => {
    if (name === null || !files.includes(name)) {
      return
    }
    let value
    try {
      value = readLayer(name)
    } catch (error) {
      log.warn(
        `invalid ${path.join(home, name)}, keeping the last version:`,
        error
      )
      return
    }
    machineConfig().put(value, {
      layer: name,
      force: true,
      meta: { source: 'file' },
    })
  })
}

function startingLayer(name: string) {
  try {
    return readLayer(name)
  } catch (error) {
    log.warn(`invalid ${path.join(home, name)}, ignoring it:`, error)
    return emptyLayer(name)
  }
}

function readLayer(name: string) {
  const saved = readJson(name)
  if (saved === null) {
    return emptyLayer(name)
  }
  return name === 'config.json' ? migrateFile(saved) : saved
}

function emptyLayer(name: string) {
  return name === 'config.json' ? { version: 4 } : {}
}

function migrateFile(saved: unknown) {
  const value = migrate(saved)
  if (value !== saved) {
    const file = path.join(home, 'config.json')
    writeJson('config.json.bak', saved)
    writeJson('config.json', value)
    log.info(`migrated ${file}, the old file is in ${file}.bak`)
  }
  return value
}

function warnDropped(dropped: StateDroppedValue[]) {
  const warning = dropped
    .map(
      (item) =>
        `${path.join(home, item.layer)}: ignored ${item.path.length === 0 ? 'the whole file' : item.path.map(String).join('.')} (${item.message})`
    )
    .join('\n')
  if (warning !== '' && warning !== lastWarning) {
    log.warn(warning)
  }
  lastWarning = warning
}

function migrate(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }
  if (!('version' in value)) {
    return fromVersion3(fromVersion2(fromVersion1(value)))
  }
  if (value.version === 2) {
    return fromVersion3(fromVersion2(value))
  }
  if (value.version === 3) {
    return fromVersion3(value)
  }
  if (value.version === 4) {
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

function fromVersion2(value: object) {
  const { commitMessage, titleGeneration, ...rest } = value as Record<
    string,
    unknown
  >
  const titles = (titleGeneration ?? {}) as Record<string, unknown>
  return {
    ...rest,
    version: 3,
    smallModel:
      titles.provider === undefined || titles.provider === null
        ? commitMessage
        : titleGeneration,
  }
}

function fromVersion3(value: object) {
  const config: Record<string, unknown> = { ...value, version: 4 }
  const chosen = (config.smallModel ?? {}) as Record<string, unknown>
  delete config.smallModel
  if (typeof chosen.provider !== 'string' || typeof chosen.model !== 'string') {
    return config
  }
  return {
    ...config,
    [chosen.provider]: {
      ...(config[chosen.provider] as object | undefined),
      smallModel: chosen.model,
    },
  }
}

export function saveConfig(value: unknown) {
  return machineConfig().put(value).value
}
