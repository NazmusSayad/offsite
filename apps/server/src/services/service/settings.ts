import { execFile, exec } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
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
export const startedFile = path.join(serviceDir, 'started')
export const settingsFile = path.join(home, 'service', 'settings.json')
const logsDir = path.join(home, 'logs')
const logFile = path.join(logsDir, 'service.log')
const SETTINGS = path.join('service', 'settings.json')
const TRIES = 6

export const serviceSettingsSchema = z.object({
  manager: z.enum(packageManagers),
  arguments: z.array(z.string()),
})

export type ServiceSettings = z.infer<typeof serviceSettingsSchema>

export function readServiceSettings() {
  return readSettings(SETTINGS, serviceSettingsSchema.nullable(), null)
}

export function writeServiceSettings(settings: ServiceSettings) {
  mkdirSync(serviceDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true, mode: 0o700 })
  writeJson(SETTINGS, settings)
}

export async function runTool(name: string, toolArguments: string[]) {
  if (process.platform === 'win32') {
    const result = await runLine([name, ...toolArguments].join(' '))
    return result.stdout
  }
  const result = await runFile(name, toolArguments)
  return result.stdout
}

export async function runOffsite(extra: string[]) {
  const line = ['offsite', ...extra]
  if (process.platform === 'win32') {
    const result = await runFile('powershell.exe', [
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `& ${line.map(powershellQuote).join(' ')}`,
    ])
    return lastLine(result.stdout)
  }
  const shell = os.userInfo().shell
  if (shell === null) {
    throw new Error('offsite could not find your login shell')
  }
  const running = runFile(shell, [
    '-l',
    '-i',
    '-c',
    `exec ${line.map(shellQuote).join(' ')}`,
  ])
  running.child.stdin?.end()
  return lastLine((await running).stdout)
}

function lastLine(output: string) {
  return output.trim().split(/\r?\n/).at(-1) ?? ''
}

export function writeScript() {
  const content = script()
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

function script() {
  const fromHome = path.relative(os.homedir(), home)
  const dir =
    fromHome.startsWith('..') || path.isAbsolute(fromHome)
      ? home
      : fromHome === ''
        ? '.'
        : fromHome
  const line = ['offsite', '--service', dir]
  const stopped = `offsite didn't start ${TRIES} times in a row, so the service stopped; fix the problem, then run offsite install`
  const logs = path.relative(home, logsDir)
  const log = path.relative(home, logFile)
  const started = path.relative(home, startedFile)
  if (process.platform === 'win32') {
    return [
      '$base = Split-Path -Parent $PSScriptRoot',
      'Set-Location -Path $HOME',
      `$logs = Join-Path $base ${powershellQuote(logs)}`,
      `$log = Join-Path $base ${powershellQuote(log)}`,
      `$started = Join-Path $base ${powershellQuote(started)}`,
      '$failures = 0',
      'while ($true) {',
      '  New-Item -ItemType Directory -Force -Path $logs | Out-Null',
      '  Remove-Item -Force -ErrorAction SilentlyContinue -Path $started',
      `  & ${line.map(powershellQuote).join(' ')} 2>&1 | ForEach-Object { "$_" } | Out-File -FilePath $log -Append -Encoding utf8`,
      '  if (Test-Path -Path $started) { $failures = 0 } else { $failures++ }',
      `  if ($failures -ge ${TRIES}) {`,
      `    ${powershellQuote(stopped)} | Out-File -FilePath $log -Append -Encoding utf8`,
      '    exit 1',
      '  }',
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
    'base=$(cd "$(dirname "$0")/.." && pwd)',
    `logs="$base"/${shellQuote(logs)}`,
    `log="$base"/${shellQuote(log)}`,
    `started="$base"/${shellQuote(started)}`,
    'mkdir -p "$logs"',
    findShell,
    'if [ -z "$shell" ]; then',
    '  echo "offsite could not find your login shell" >> "$log"',
    '  exit 1',
    'fi',
    'cd "$HOME"',
    'failures=0',
    'while true; do',
    '  mkdir -p "$logs"',
    '  rm -f "$started"',
    `  "$shell" -l -i -c ${shellQuote(command)} < /dev/null >> "$log" 2>&1`,
    '  if [ -e "$started" ]; then failures=0; else failures=$((failures + 1)); fi',
    `  if [ "$failures" -ge ${TRIES} ]; then`,
    `    echo ${shellQuote(stopped)} >> "$log"`,
    '    exit 1',
    '  fi',
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
