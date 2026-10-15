import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { platform } from '../config.ts'
import { home } from '../storage.ts'
import { shellIntegrationIssue } from './shell-check.ts'

const scripts = path.join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'terminal',
  'shell-integration'
)
const folder = path.join(home, 'shell-integration')

export function prepare(
  env: Record<string, string>,
  command: string | null,
  shell: string
) {
  if (shellIntegrationIssue(command, platform(), shell) !== null) return null
  const words =
    command === null
      ? [shell]
      : command.split(/[ \t]/).filter((word) => word !== '')
  const program = command === null ? `'${shell}'` : words[0]
  const args = words.slice(1)
  const name = words[0].split('/').pop()
  let integration: string
  if (name === 'bash') {
    const userHome = process.env.HOME
    if (userHome === undefined || userHome === '') return null
    const script = path.join(folder, 'bash', 'offsite.bash')
    if (!writeScript(script, 'bash/offsite.bash')) return null
    env.ENV = script.replace(/[\\$`"]/g, (character) => `\\${character}`)
    env.HISTFILE = path.join(userHome, '.bash_history')
    integration = ' --posix'
  } else if (name === 'zsh') {
    if (!zshGlobalsSupported()) return null
    if (
      ['.zshenv', '.zprofile', '.zshrc', '.zlogin'].every(
        (file) => !existsSync(path.join(os.homedir(), file))
      )
    )
      return null
    if (!writeScript(path.join(folder, 'zsh', '.zshenv'), 'zsh/.zshenv'))
      return null
    env.ZDOTDIR = path.join(folder, 'zsh')
    integration = ''
  } else if (name === 'fish') {
    const script = path.join(folder, 'fish', 'offsite.fish')
    if (!writeScript(script, 'fish/offsite.fish')) return null
    const source = `source '${script.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
    integration = ` --init-command '${source.replaceAll("'", "'\\''")}'`
  } else throw new Error(`shell integration does not support ${name}`)
  return [`${program}${integration}`, ...args].join(' ')
}

function zshGlobalsSupported() {
  for (const global of ['/etc/zshenv', '/etc/zsh/zshenv']) {
    let contents: string
    try {
      contents = readFileSync(global, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      console.warn(
        `could not read ${global}, zsh starts without shell integration: ${error}`
      )
      return false
    }
    for (const rawLine of contents.split('\n')) {
      const line = rawLine.trimStart()
      if (line.startsWith('#')) continue
      const normalized = line.toLowerCase().replaceAll('_', '')
      if (
        [
          'zdotdir',
          'rcs',
          'emulate',
          'debug',
          'xtrace',
          'verbose',
          'sourcetrace',
        ].some((word) => normalized.includes(word))
      )
        return false
      let setting = false
      for (const word of line.split(/[ \t;&|]/)) {
        if (word === '') continue
        if (['set', 'setopt', 'unsetopt'].includes(word)) {
          setting = true
          continue
        }
        const flag = word.startsWith('-') || word.startsWith('+')
        if (setting && flag && /[fxv]/.test(word)) return false
        if (!flag) setting = false
      }
    }
  }
  return true
}

function writeScript(target: string, source: string) {
  try {
    const contents = readFileSync(path.join(scripts, source), 'utf8')
    const existing = lstatSync(target, { throwIfNoEntry: false })
    if (existing?.isFile() && readFileSync(target, 'utf8') === contents)
      return true
    mkdirSync(path.dirname(target), { recursive: true })
    rmSync(`${target}.tmp`, { force: true })
    writeFileSync(`${target}.tmp`, contents, { flag: 'wx' })
    renameSync(`${target}.tmp`, target)
    return true
  } catch (error) {
    console.warn(
      `could not write ${target}, the shell starts without shell integration: ${error}`
    )
    return false
  }
}
