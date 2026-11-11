import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PackageManager } from '@offsite/core/service'
import { args } from '../../args.ts'
import { register, unregister } from './register.ts'
import { runTool, writeScript, writeServiceSettings } from './settings.ts'
import { restartSoon } from './update.ts'

export async function installFromBrowser(manager: PackageManager) {
  if (args.service) {
    throw new Error('offsite is already installed')
  }
  const command = await startCommand(manager)
  await unregister()
  await setUp(manager, command)
  restartSoon()
}

export async function setUp(manager: PackageManager, command: string[]) {
  const settings = {
    manager,
    command,
    arguments: args.serverArguments,
  }
  writeServiceSettings(settings)
  writeScript(settings)
  await register()
}

export async function startCommand(manager: PackageManager) {
  if (manager === 'mise') {
    try {
      await runTool('mise', ['where', 'npm:offsite'])
    } catch {
      throw new Error("offsite isn't installed with mise")
    }
    return ['mise', 'exec', 'npm:offsite', '--', 'offsite']
  }
  const folder = await binFolder(manager)
  const names =
    process.platform === 'win32'
      ? ['offsite.ps1', 'offsite.exe', 'offsite.cmd']
      : ['offsite']
  for (const name of names) {
    const file = path.join(folder, name)
    if (existsSync(file)) {
      return [file]
    }
  }
  throw new Error(
    `offsite isn't installed globally with ${manager}; nothing named offsite in ${folder}`
  )
}

async function binFolder(manager: 'npm' | 'pnpm' | 'bun') {
  switch (manager) {
    case 'npm': {
      const prefix = (await runTool('npm', ['prefix', '-g'])).trim()
      return process.platform === 'win32' ? prefix : path.join(prefix, 'bin')
    }
    case 'pnpm':
      return (await runTool('pnpm', ['bin', '-g'])).trim()
    case 'bun':
      return (await runTool('bun', ['pm', 'bin', '-g'])).trim()
  }
}
