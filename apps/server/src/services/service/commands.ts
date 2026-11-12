import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { packageManagers } from '@offsite/core/service'
import { consola } from 'consola'
import { z } from 'zod'
import { args, SERVICE_PORT, version } from '../../args.ts'
import { home, readJson, runningPid } from '../../storage/storage.ts'
import { unregister } from './register.ts'
import {
  readServiceSettings,
  type ServiceSettings,
  serviceDir,
  settingsFile,
} from './settings.ts'
import { findOffsite, setUp } from './setup.ts'
import { install as installUpdate, latestVersion, newer } from './update.ts'

const STATUS_TIMEOUT = 10_000
const STOP_TIMEOUT = 15_000
const STOP_CHECK = 250
const runningSchema = z.object({ status: z.string(), service: z.boolean() })
const statusSchema = z.object({
  version: z.string(),
  busy: z.array(z.string()),
})

export async function install() {
  if (!process.stdin.isTTY) {
    console.error('offsite install needs an interactive terminal')
    process.exit(1)
  }
  const manager = z
    .enum(packageManagers)
    .nullable()
    .parse(
      await consola.prompt(
        'Which package manager did you install offsite with?',
        {
          type: 'select',
          options: [...packageManagers],
          cancel: 'null',
        }
      )
    )
  if (manager === null) {
    console.log('Nothing installed')
    return
  }
  try {
    await findOffsite()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
  const pid = runningPid()
  const running = runningSchema.safeParse(readJson('server.json'))
  if (pid !== null && !(running.success && running.data.service)) {
    console.error(
      `offsite is already running for ${home} (pid ${pid}); stop it, then run offsite install again`
    )
    process.exit(1)
  }
  const saved = readServiceSettings()
  const flags = [
    ...(args.portGiven ? ['--port', args.port] : []),
    ...args.serverArguments,
  ]
  const serviceArguments =
    flags.length === 0 && saved !== null
      ? saved.arguments
      : args.portGiven
        ? flags
        : ['--port', SERVICE_PORT, ...flags]
  await stopService()
  try {
    await setUp({ manager, arguments: serviceArguments })
  } catch (error) {
    console.error('Could not start offsite at login:', error)
    process.exit(1)
  }
  console.log(
    `offsite starts at login with: offsite ${serviceArguments.join(' ')}`
  )
  console.log(`Settings: ${settingsFile}`)
  console.log(`Log: ${path.join(home, 'logs', 'service.log')}`)
  if (!serviceArguments.includes('--no-auth')) {
    console.log('Run offsite pair to pair a browser')
  }
}

export async function uninstall() {
  const installed = existsSync(serviceDir)
  await stopService()
  rmSync(serviceDir, { recursive: true, force: true })
  console.log(
    installed ? 'offsite no longer starts at login' : "offsite wasn't installed"
  )
}

export async function status() {
  const settings = readServiceSettings()
  console.log(
    settings === null
      ? 'Not installed; run offsite install to start it at login'
      : `Installed; starts at login and updates with ${settings.manager}`
  )
  const pid = runningPid()
  if (pid === null) {
    console.log('Not running')
    return
  }
  const running = runningSchema.safeParse(readJson('server.json'))
  if (!running.success) {
    console.log(`Running (pid ${pid}); it's too old to report if it's busy`)
    return
  }
  let response
  try {
    response = await fetch(running.data.status, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT),
    })
  } catch (error) {
    console.log(`Running (pid ${pid}); it isn't answering:`, error)
    return
  }
  if (!response.ok) {
    console.log(`Running (pid ${pid}); it answered ${response.status}`)
    return
  }
  const state = statusSchema.parse(await response.json())
  console.log(
    `Running offsite ${state.version} (pid ${pid}${running.data.service ? ', started at login' : ''})`
  )
  if (state.busy.length === 0) {
    console.log('Idle')
    return
  }
  console.log('Busy:')
  for (const reason of state.busy) {
    console.log(`  ${reason}`)
  }
}

export async function update() {
  const settings = readServiceSettings()
  if (settings === null) {
    console.error(
      "offsite isn't installed as a service; update it with your package manager"
    )
    process.exit(1)
  }
  if (version === 'dev') {
    console.error("a dev build can't update itself")
    process.exit(1)
  }
  const latest = await latestVersion()
  const installed = newer(latest, version)
    ? await updateTo(latest, settings)
    : version
  const service = await runningService()
  if (service === null) {
    console.log(
      installed === version
        ? `offsite ${version} is the latest`
        : `offsite ${installed} is installed`
    )
    return
  }
  if (!newer(installed, service.version)) {
    console.log(`offsite ${service.version} is the latest`)
    return
  }
  process.kill(service.pid)
  console.log(
    `offsite ${installed} is installed; the service is restarting with it`
  )
}

async function updateTo(latest: string, settings: ServiceSettings) {
  console.log(
    `Updating offsite ${version} to ${latest} with ${settings.manager}…`
  )
  const installed = await installUpdate(settings)
  if (!newer(installed, version)) {
    console.error(
      `the update finished, but a new terminal still runs offsite ${installed}; check that the offsite on your PATH is the one ${settings.manager} installs`
    )
    process.exit(1)
  }
  return installed
}

async function runningService() {
  const pid = runningPid()
  const running = runningSchema.safeParse(readJson('server.json'))
  if (pid === null || !running.success || !running.data.service) {
    return null
  }
  const response = await fetch(running.data.status, {
    signal: AbortSignal.timeout(STATUS_TIMEOUT),
  })
  if (!response.ok) {
    throw new Error(`the running service answered ${response.status}`)
  }
  return { pid, version: statusSchema.parse(await response.json()).version }
}

async function stopService() {
  await unregister()
  const pid = runningPid()
  const running = runningSchema.safeParse(readJson('server.json'))
  if (pid === null || !running.success || !running.data.service) {
    return
  }
  process.kill(pid)
  const deadline = Date.now() + STOP_TIMEOUT
  while (runningPid() !== null) {
    if (Date.now() > deadline) {
      console.error(`offsite (pid ${pid}) didn't stop`)
      process.exit(1)
    }
    await setTimeout(STOP_CHECK)
  }
}
