import { writeFileSync } from 'node:fs'
import type { PackageManager, ServiceState } from '@offsite/core/service'
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
const releaseSchema = z.object({
  tag_name: z.string(),
  assets: z.array(z.object({ name: z.string() })),
})
const REPOSITORY = 'NazmusSayad/offsite'
const miseTools = {
  'mise-github': `github:${REPOSITORY}`,
  'mise-npm': 'npm:offsite',
}
const systems: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'windows',
}

let available: string | null = null
let installing: Promise<string> | null = null

export function serviceState(): ServiceState {
  const settings = args.service ? readServiceSettings() : null
  return {
    installed: args.service,
    update: available,
    manager: settings?.manager ?? null,
    arguments: settings?.arguments ?? [
      '--port',
      args.port,
      ...args.serverArguments,
    ],
  }
}

export function startService() {
  writeFileSync(startedFile, '')
  const settings = readServiceSettings()
  if (settings === null) {
    log.warn('started by the service, but its settings are missing')
    return
  }
  if (writeScript()) {
    log.info(
      'updated the start script; the service uses it from its next start'
    )
  }
  if (settings.manager === 'mise-github' || settings.manager === 'mise-npm') {
    void prune(miseTools[settings.manager])
  }
  if (version === 'dev') {
    log.info('a dev build never checks for updates')
    return
  }
  void check()
}

async function prune(tool: string) {
  try {
    await runTool('mise', ['prune', '--tools', '--yes', tool])
  } catch (error) {
    log.warn('could not remove old offsite versions with mise:', error)
  }
}

export async function checkNow() {
  if (version === 'dev') {
    throw new Error("a dev build doesn't check for updates")
  }
  const settings = readServiceSettings()
  if (settings === null) {
    throw new Error(
      "offsite isn't installed, so it doesn't know where its updates come from"
    )
  }
  const latest = await latestVersion(settings.manager)
  const isNewer = newer(latest, version)
  const next = isNewer ? latest : null
  if (args.service && available !== next) {
    available = next
    broadcast({ type: 'service', service: serviceState() })
  }
  return { latest, newer: isNewer }
}

async function check() {
  try {
    await checkNow()
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

export function install(settings: ServiceSettings) {
  installing ??= installLatest(settings).finally(() => {
    installing = null
  })
  return installing
}

async function installLatest(settings: ServiceSettings) {
  log.info(`updating offsite with ${settings.manager}`)
  const mise =
    settings.manager === 'mise-github' || settings.manager === 'mise-npm'
  if (mise) {
    await runTool('mise', ['cache', 'clear'])
  }
  await runTool(
    mise ? 'mise' : settings.manager,
    updateArguments(settings.manager)
  )
  return runOffsite(['--version'])
}

export function newer(candidate: string, current: string) {
  const next = candidate.split('-')[0].split('.').map(Number)
  const now = current.split('-')[0].split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    if (next[index] !== now[index]) {
      return next[index] > now[index]
    }
  }
  return current.includes('-') && !candidate.includes('-')
}

export async function latestVersion(manager: PackageManager) {
  switch (manager) {
    case 'mise-github':
      return latestRelease()
    case 'mise-npm':
    case 'npm':
    case 'pnpm':
    case 'bun':
      return latestPackage()
  }
}

async function latestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    { signal: AbortSignal.timeout(REGISTRY_TIMEOUT) }
  )
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status}`)
  }
  const release = releaseSchema.parse(await response.json())
  const system = systems[process.platform]
  if (system === undefined) {
    throw new Error(`offsite has no build for ${process.platform}`)
  }
  const asset = `offsite-${system}-${process.arch}.`
  if (!release.assets.some((item) => item.name.startsWith(asset))) {
    throw new Error(
      `offsite ${release.tag_name} has no build for ${system} ${process.arch} yet`
    )
  }
  return release.tag_name.replace(/^v/, '')
}

async function latestPackage() {
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
    case 'mise-github':
    case 'mise-npm':
      return ['upgrade', miseTools[manager], '--minimum-release-age', '0s']
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
