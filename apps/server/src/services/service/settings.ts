import { execFile, exec } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { packageManagers } from '@offsite/core/service'
import { z } from 'zod'
import {
  hasCode,
  home,
  readSettings,
  writeJson,
} from '../../storage/storage.ts'

const runFile = promisify(execFile)
const runLine = promisify(exec)

export const serviceDir = path.join(home, 'service')
export const scriptFile = path.join(
  serviceDir,
  process.platform === 'win32' ? 'start.ps1' : 'start.sh'
)
const logsDir = path.join(home, 'logs')
const logFile = path.join(logsDir, 'service.log')
const SETTINGS = path.join('service', 'settings.json')

const settingsSchema = z.object({
  manager: z.enum(packageManagers),
  command: z.array(z.string()),
  arguments: z.array(z.string()),
})

export type ServiceSettings = z.infer<typeof settingsSchema>

export function readServiceSettings() {
  return readSettings(SETTINGS, settingsSchema.nullable(), null)
}

export function writeServiceSettings(settings: ServiceSettings) {
  mkdirSync(serviceDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true, mode: 0o700 })
  writeJson(SETTINGS, settings)
}

export async function runTool(
  name: string,
  toolArguments: string[],
  extraEnv: Record<string, string> = {}
) {
  const env = { ...process.env, ...extraEnv }
  if (process.platform === 'win32') {
    const result = await runLine([name, ...toolArguments].join(' '), { env })
    return result.stdout
  }
  const result = await runFile(name, toolArguments, { env })
  return result.stdout
}

export async function runOffsite(settings: ServiceSettings, extra: string[]) {
  if (process.platform === 'win32') {
    const line = [...settings.command, ...extra].map(powershellQuote).join(' ')
    const result = await runFile('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `& ${line}`,
    ])
    return result.stdout
  }
  const result = await runFile(settings.command[0], [
    ...settings.command.slice(1),
    ...extra,
  ])
  return result.stdout
}

export function writeScript(settings: ServiceSettings) {
  const content = script(settings)
  try {
    if (readFileSync(scriptFile, 'utf8') === content) {
      return false
    }
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error
    }
  }
  mkdirSync(serviceDir, { recursive: true })
  writeFileSync(`${scriptFile}.tmp`, content, { mode: 0o700 })
  renameSync(`${scriptFile}.tmp`, scriptFile)
  return true
}

function script(settings: ServiceSettings) {
  const line = [...settings.command, ...settings.arguments, '--service']
  if (process.platform === 'win32') {
    return [
      'while ($true) {',
      `  New-Item -ItemType Directory -Force -Path ${powershellQuote(logsDir)} | Out-Null`,
      `  & ${line.map(powershellQuote).join(' ')} 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath ${powershellQuote(logFile)} -Append -Encoding utf8`,
      '  Start-Sleep -Seconds 5',
      '}',
      '',
    ].join('\r\n')
  }
  const findShell =
    process.platform === 'darwin'
      ? 'shell=$(dscl . -read "/Users/$(id -un)" UserShell | sed \'s/^UserShell: //\')'
      : 'shell=$(getent passwd "$(id -un)" | cut -d: -f7)'
  const command = `exec ${line.map(shellQuote).join(' ')}`
  return [
    '#!/bin/sh',
    `mkdir -p ${shellQuote(logsDir)}`,
    findShell,
    'if [ -z "$shell" ]; then',
    `  echo "offsite could not find your login shell" >> ${shellQuote(logFile)}`,
    '  exit 1',
    'fi',
    'cd "$HOME"',
    'while true; do',
    `  mkdir -p ${shellQuote(logsDir)}`,
    `  "$shell" -l -i -c ${shellQuote(command)} < /dev/null >> ${shellQuote(logFile)} 2>&1`,
    '  sleep 5',
    'done',
    '',
  ].join('\n')
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function powershellQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}
