import { execFile } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile, readlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { spawn } from '@lydell/node-pty'
import { defaultShell, platform, readConfig } from '../../storage/config.ts'
import { prepare } from './shell-integration.ts'

const run = promisify(execFile)
const iterm2Version = '3.6.8'
const ghosttyVersion = '1.3.1'
const shellNames =
  process.platform === 'win32'
    ? ['pwsh', 'powershell', 'cmd']
    : ['zsh', 'bash', 'fish', 'pwsh']

export function startShell(cwd: string) {
  const options = launch()
  const env: Record<string, string> = {}
  let file: string
  let args: string[]
  if (process.platform === 'win32') {
    Object.assign(env, process.env)
    file = options.command ?? defaultShell()
    args = []
  } else {
    for (const name of ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'SSH_AUTH_SOCK']) {
      const value = process.env[name]
      if (value !== undefined) {
        env[name] = value
      }
    }
    const shell = defaultShell()
    env.SHELL = shell
    env.LANG = 'en_US.UTF-8'
    if (process.env.PATH !== undefined) {
      env.PATH = process.env.PATH
    }
    const program =
      (options.shellIntegration
        ? prepare(env, options.command, shell)
        : null) ??
      options.command ??
      `'${shell}'`
    file = '/bin/bash'
    args = ['--noprofile', '--norc', '-c', `export -n PATH; exec -l ${program}`]
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  Object.assign(env, options.environment)
  return spawn(file, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env,
    encoding: null,
  })
}

export async function currentDirectory(pid: number) {
  if (process.platform === 'linux') {
    return readlink(`/proc/${pid}/cwd`)
  }
  if (process.platform === 'darwin') {
    const { stdout } = await run('lsof', [
      '-a',
      '-d',
      'cwd',
      '-p',
      String(pid),
      '-Fn',
    ])
    const line = stdout.split('\n').find((item) => item.startsWith('n'))
    if (line === undefined) {
      throw new Error(`lsof found no folder for ${pid}`)
    }
    return line.slice(1)
  }
  throw new Error(
    'reading the directory of another process is not supported on this platform'
  )
}

export async function busyProgram(pid: number) {
  if (process.platform === 'win32') {
    const { stdout } = await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty Name`,
    ])
    const names = [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line !== '')
      ),
    ]
    return names.length === 0 ? null : names.join(', ')
  }
  const group = await foregroundGroup(pid)
  if (group <= 0) {
    throw new Error('its foreground process group is unknown')
  }
  if (group === pid) {
    return null
  }
  try {
    return await programName(group)
  } catch (error) {
    console.warn(`could not read the name of process ${group}: ${error}`)
    return `process ${group}`
  }
}

async function foregroundGroup(pid: number) {
  if (process.platform === 'linux') {
    const text = await readFile(`/proc/${pid}/stat`, 'utf8')
    return Number(text.slice(text.lastIndexOf(')') + 2).split(' ')[5])
  }
  const { stdout } = await run('ps', ['-o', 'tpgid=', '-p', String(pid)])
  return Number(stdout.trim())
}

async function programName(pid: number) {
  if (process.platform === 'linux') {
    return (await readFile(`/proc/${pid}/comm`, 'utf8')).trimEnd()
  }
  const { stdout } = await run('ps', ['-o', 'comm=', '-p', String(pid)])
  return path.basename(stdout.trim())
}

function launch() {
  const config = readConfig().terminal
  const [program, terminal, programVersion] = {
    offsite: ['offsite', 'offsite', '0.0.0'],
    ghostty: ['ghostty', 'ghostty', ghosttyVersion],
    iterm2: ['iTerm.app', 'iTerm2', iterm2Version],
  }[config.behavior.terminalIdentity]
  return {
    command: config.shell[platform()],
    environment: {
      TERM_PROGRAM: program,
      TERM_PROGRAM_VERSION: programVersion,
      LC_TERMINAL: terminal,
      LC_TERMINAL_VERSION: programVersion,
    },
    shellIntegration: config.behavior.shellIntegration,
  }
}

export function listShells() {
  const candidates = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter((directory) => directory !== '')
    .flatMap((directory) =>
      shellNames.map((name) => path.join(directory, executable(name)))
    )
  if (process.platform !== 'win32') {
    try {
      candidates.push(
        ...readFileSync('/etc/shells', 'utf8')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('/'))
      )
    } catch {}
  }
  const seen = new Set<string>()
  const shells: { name: string; path: string }[] = []
  for (const name of shellNames) {
    for (const candidate of candidates) {
      if (path.basename(candidate) !== executable(name)) {
        continue
      }
      if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
        continue
      }
      let target
      try {
        target = realpathSync(candidate)
      } catch {
        continue
      }
      if (seen.has(target)) {
        continue
      }
      seen.add(target)
      shells.push({ name, path: candidate })
    }
  }
  return shells
}

function executable(name: string) {
  return process.platform === 'win32' ? `${name}.exe` : name
}
