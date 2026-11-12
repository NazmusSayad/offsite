import { args } from '../../args.ts'
import { register, unregister } from './register.ts'
import {
  runOffsite,
  type ServiceSettings,
  serviceSettingsSchema,
  writeScript,
  writeServiceSettings,
} from './settings.ts'
import { restartSoon } from './update.ts'

export async function installFromBrowser(input: ServiceSettings) {
  const settings = serviceSettingsSchema.parse(input)
  if (args.service) {
    writeServiceSettings(settings)
    restartSoon()
    return
  }
  await findOffsite()
  await unregister()
  await setUp(settings)
  restartSoon()
}

export async function setUp(settings: ServiceSettings) {
  writeServiceSettings(settings)
  writeScript()
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
