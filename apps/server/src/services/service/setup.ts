import type { PackageManager } from '@offsite/core/service'
import { args } from '../../args.ts'
import { register, unregister } from './register.ts'
import { runOffsite, writeScript, writeServiceSettings } from './settings.ts'
import { restartSoon } from './update.ts'

export async function installFromBrowser(manager: PackageManager) {
  if (args.service) {
    throw new Error('offsite is already installed')
  }
  await findOffsite()
  await unregister()
  await setUp(manager)
  restartSoon()
}

export async function setUp(manager: PackageManager) {
  const settings = {
    manager,
    arguments: args.serverArguments,
  }
  writeServiceSettings(settings)
  writeScript(settings)
  await register()
}

export async function findOffsite() {
  try {
    await runOffsite(['--version'])
  } catch (error) {
    throw new Error(
      `A new terminal can't run offsite, so the service couldn't start it: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
