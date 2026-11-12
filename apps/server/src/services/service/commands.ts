import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { packageManagers } from '@offsite/core/service'
import { consola } from 'consola'
import { z } from 'zod'
import { args } from '../../args.ts'
import { home, readJson, runningPid } from '../../storage/storage.ts'
import { unregister } from './register.ts'
import { readServiceSettings, serviceDir } from './settings.ts'
import { findOffsite, setUp } from './setup.ts'

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
  await stopService()
  try {
    await setUp(manager)
  } catch (error) {
    console.error('Could not start offsite at login:', error)
    process.exit(1)
  }
  console.log(
    `offsite now starts at login, and Update now in the sidebar updates it with ${manager}; its output goes to ${path.join(home, 'logs', 'service.log')}`
  )
  if (args.auth) {
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
