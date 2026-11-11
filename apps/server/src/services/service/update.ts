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
  writeScript,
} from './settings.ts'
import { busyReasons } from './status.ts'

const CHECK_INTERVAL = 30 * 60_000
const IDLE_INTERVAL = 60_000
const REGISTRY_TIMEOUT = 30_000
const RESTART_DELAY = 1000
const log = logger.withTag('service')
const latestSchema = z.object({ version: z.string() })

let available: string | null = null
let ready: string | null = null
let installing: Promise<string> | null = null

export function serviceState(): ServiceState {
  return { installed: args.service, update: available }
}

export function startService() {
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
    log.info('a dev build never updates itself')
    return
  }
  void check(settings)
}

async function prune() {
  try {
    await runTool('mise', ['prune', '--tools', '--yes', 'npm:offsite'])
  } catch (error) {
    log.warn('could not remove old offsite versions with mise:', error)
  }
}

async function check(settings: ServiceSettings) {
  try {
    const latest = await latestVersion()
    if (newer(latest, version)) {
      if (available !== latest) {
        available = latest
        broadcast({ type: 'service', service: serviceState() })
      }
      const installed = await install(settings)
      if (newer(installed, version)) {
        ready = installed
        log.info(`offsite ${installed} is installed, restarting once idle`)
        void waitForIdle()
        return
      }
      log.warn(`the update finished, but offsite ${version} is still installed`)
    }
  } catch (error) {
    log.warn('could not update offsite:', error)
  }
  setTimeout(() => void check(settings), CHECK_INTERVAL)
}

export async function updateNow() {
  const settings = readServiceSettings()
  if (!args.service || settings === null) {
    throw new Error(
      "offsite isn't installed, so nothing would start the new version"
    )
  }
  if (ready === null) {
    const installed = await install(settings)
    if (!newer(installed, version)) {
      throw new Error(
        `the update finished, but offsite ${version} is still installed`
      )
    }
    ready = installed
  }
  log.info(`restarting into offsite ${ready} on request`)
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
  return (await runOffsite(settings, ['--version'])).trim()
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

async function waitForIdle() {
  let reasons
  try {
    reasons = await busyReasons()
  } catch (error) {
    log.warn('could not tell if offsite is idle:', error)
    setTimeout(() => void waitForIdle(), IDLE_INTERVAL)
    return
  }
  if (reasons.length > 0) {
    setTimeout(() => void waitForIdle(), IDLE_INTERVAL)
    return
  }
  log.info('idle, exiting so the service starts the new version')
  restart()
}

function restart() {
  stopAll()
  process.exit(0)
}
