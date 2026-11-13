import { writeFileSync } from 'node:fs'
import type {
  PackageManager,
  ServiceState,
  ServiceUpdate,
} from '@offsite/core/service'
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
  streamTool,
  writeScript,
} from './settings.ts'

const CHECK_INTERVAL = 30 * 60_000
const REGISTRY_TIMEOUT = 30_000
const RESTART_DELAY = 1000
const PROGRESS_INTERVAL = 500
const BYTES =
  /([\d.]+)\s*(B|kB|KB|MB|GB|KiB|MiB|GiB)?\s*\/\s*([\d.]+)\s*(B|kB|KB|MB|GB|KiB|MiB|GiB)\b/
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*%/
const units: Record<string, number> = {
  B: 1,
  kB: 1e3,
  KB: 1e3,
  MB: 1e6,
  GB: 1e9,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
}
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

let update: ServiceUpdate | null = null
let progressTimer: NodeJS.Timeout | undefined
let installing: Promise<string> | null = null

export function serviceState(): ServiceState {
  const settings = args.service ? readServiceSettings() : null
  return {
    installed: args.service,
    update,
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
  if (args.service && update?.status !== 'downloading') {
    const next = isNewer ? latest : null
    const ready = update?.status === 'ready' && !newer(latest, update.version)
    if (!ready && (update?.version ?? null) !== next) {
      setUpdate(next === null ? null : { version: next, status: 'available' })
    }
  }
  return { latest, newer: isNewer }
}

function setUpdate(next: ServiceUpdate | null) {
  update = next
  broadcast({ type: 'service', service: serviceState() })
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
  if (update?.status !== 'available') {
    throw new Error('there is no offsite update waiting to download')
  }
  const available = update.version
  setUpdate({
    version: available,
    status: 'downloading',
    output: null,
    percent: null,
  })
  try {
    const installed = await install(settings)
    if (!newer(installed, version)) {
      throw new Error(
        `the update finished, but a new terminal still runs offsite ${installed}; check that the offsite on your PATH is the one ${settings.manager} installs`
      )
    }
    log.info(`downloaded offsite ${installed}; it runs from the next restart`)
    setUpdate({ version: installed, status: 'ready' })
  } catch (error) {
    setUpdate({ version: available, status: 'available' })
    throw error
  }
}

export function restartNow() {
  if (!args.service) {
    throw new Error("offsite isn't installed, so nothing would start it again")
  }
  log.info('restarting on request')
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
  await streamTool(
    mise ? 'mise' : settings.manager,
    updateArguments(settings.manager),
    showProgress
  )
  return runOffsite(['--version'])
}

function showProgress(line: string) {
  if (update?.status !== 'downloading') {
    return
  }
  update = {
    ...update,
    output: line,
    percent: readPercent(line) ?? update.percent,
  }
  progressTimer ??= setTimeout(() => {
    progressTimer = undefined
    broadcast({ type: 'service', service: serviceState() })
  }, PROGRESS_INTERVAL)
}

function readPercent(line: string) {
  const bytes = BYTES.exec(line)
  if (bytes !== null) {
    const total = Number(bytes[3]) * units[bytes[4]]
    const done = Number(bytes[1]) * units[bytes[2] ?? bytes[4]]
    return total > 0 ? Math.min(100, (done / total) * 100) : null
  }
  const percent = PERCENT.exec(line)
  return percent === null ? null : Math.min(100, Number(percent[1]))
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
      return [
        'install',
        '-g',
        'offsite@latest',
        '--min-release-age=0',
        '--loglevel=http',
      ]
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
