import { writeFileSync } from 'node:fs'
import type { ServiceState } from '@offsite/core/service'
import { z } from 'zod'
import { args, version } from '../../args.ts'
import { broadcast } from '../../lib/hub.ts'
import { logger } from '../../lib/log.ts'
import { stopAll } from '../runs.ts'
import {
  readServiceSettings,
  runOffsite,
  runTool,
  type ServiceSettings,
  startedFile,
  writeScript,
} from './settings.ts'

const CHECK_INTERVAL = 30 * 60_000
const REGISTRY_TIMEOUT = 30_000
const RESTART_DELAY = 1000
const log = logger.withTag('service')
const latestSchema = z.object({ version: z.string() })

let available: string | null = null
let installing: Promise<string> | null = null

export function serviceState(): ServiceState {
  return { installed: args.service, update: available }
}

export function startService() {
  writeFileSync(startedFile, '')
  const settings = readServiceSettings()
  if (settings === null) {
    log.warn('started by the service, but its settings are missing')
    return
  }
  if (writeScript(settings)) {
    log.info(
      'updated the start script; the service uses it from its next start'
    )
  }
  if (settings.manager === 'mise') {
    void prune()
  }
  if (version === 'dev') {
    log.info('a dev build never checks for updates')
    return
  }
  void check()
}

async function prune() {
  try {
    await runTool('mise', ['prune', '--tools', '--yes', 'npm:offsite'])
  } catch (error) {
    log.warn('could not remove old offsite versions with mise:', error)
  }
}

async function check() {
  try {
    const latest = await latestVersion()
    if (newer(latest, version) && available !== latest) {
      available = latest
      broadcast({ type: 'service', service: serviceState() })
    }
  } catch (error) {
    log.warn('could not check for an offsite update:', error)
  }
  setTimeout(() => void check(), CHECK_INTERVAL)
}

export async function updateNow() {
  const settings = readServiceSettings()
  if (!args.service || settings === null) {
    throw new Error(
      "offsite isn't installed, so nothing would start the new version"
    )
  }
  const installed = await install(settings)
  if (!newer(installed, version)) {
    throw new Error(
      `the update finished, but a new terminal still runs offsite ${installed}; check that the offsite on your PATH is the one ${settings.manager} installs`
    )
  }
  log.info(`restarting into offsite ${installed} on request`)
  restartSoon()
}

export function restartSoon() {
  setTimeout(restart, RESTART_DELAY)
}

function install(settings: ServiceSettings) {
  installing ??= installLatest(settings).finally(() => {
    installing = null
  })
  return installing
}

async function installLatest(settings: ServiceSettings) {
  log.info(`updating offsite with ${settings.manager}`)
  await runTool(
    settings.manager,
    updateArguments(settings.manager),
    settings.manager === 'mise' ? { MISE_FETCH_REMOTE_VERSIONS_CACHE: '0' } : {}
  )
  return runOffsite(['--version'])
}

function newer(candidate: string, current: string) {
  const next = candidate.split('-')[0].split('.').map(Number)
  const now = current.split('-')[0].split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (next[index] !== now[index]) {
      return next[index] > now[index]
    }
  }
  return current.includes('-') && !candidate.includes('-')
}

async function latestVersion() {
  const response = await fetch('https://registry.npmjs.org/offsite/latest', {
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT),
  })
  if (!response.ok) {
    throw new Error(`the npm registry answered ${response.status}`)
  }
  return latestSchema.parse(await response.json()).version
}

function updateArguments(manager: ServiceSettings['manager']) {
  switch (manager) {
    case 'mise':
      return ['upgrade', 'npm:offsite', '--minimum-release-age', '0s']
    case 'npm':
      return ['install', '-g', 'offsite@latest', '--min-release-age=0']
    case 'pnpm':
      return ['add', '-g', 'offsite@latest', '--config.minimum-release-age=0']
    case 'bun':
      return [
        'add',
        '-g',
        'offsite@latest',
        '--minimum-release-age=0',
        '--no-cache',
      ]
  }
}

function restart() {
  stopAll()
  process.exit(0)
}
