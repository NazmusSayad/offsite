import type {
  OptionAsMeta,
  TerminalBackground,
  TerminalOptions,
} from './ghostty/terminal'
import { type BuiltinTheme, themeColors } from './themes'

export type Platform = 'macos' | 'linux' | 'windows'

export type Shell = { command: string | null; cwd: string }

export type TerminalIdentity = 'sshtty' | 'iterm2'

export type ClipboardRead = 'ask' | 'allow' | 'deny'

export type Config = {
  shell: Record<Platform, Shell>
  font: { family: string; size: number; lineHeight: number; ligatures: boolean }
  cursor: { style: 'block' | 'bar' | 'underline'; blink: boolean }
  padding: { top: number; right: number; bottom: number; left: number }
  scrollback: number
  theme: { name: string; boldIsBright: boolean; colors?: ThemeColors }
  emptyScreenAnimation: boolean
  behavior: {
    modernizeShiftEnter: boolean
    pasteBrowserImages: boolean
    showGitBranch: boolean
    captureShortcuts: boolean
    bellFlash: boolean
    bellSound: boolean
    terminalIdentity: TerminalIdentity
    shellIntegration: boolean
    commandMarks: boolean
    clickToMoveCursor: boolean
    optionAsMeta: OptionAsMeta
    clipboardRead: ClipboardRead
    confirmCloseBusyTab: boolean
    backgroundImage: string | null
    backgroundOpacity: number
    backgroundFit: TerminalBackground['fit']
    activityMarks: boolean
  }
}

export type ThemeColors = {
  background: string
  foreground: string
  cursor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
  palette: string[]
}

const iterm2Version = '3.6.8'

const paletteKeys = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

export const paletteNames = paletteKeys.map((key) => {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words[0].toUpperCase() + words.slice(1)
})

export const builtinFonts = [
  { family: 'FiraCode Nerd Font', label: 'Fira Code' },
  { family: 'JetBrainsMono Nerd Font', label: 'JetBrains Mono' },
  { family: 'CaskaydiaCove Nerd Font', label: 'Cascadia Code' },
  { family: 'Hack Nerd Font', label: 'Hack' },
]

export const platforms: { value: Platform; label: string }[] = [
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows' },
]

export async function loadSettings() {
  const response = await fetch('/api/config')
  if (!response.ok) throw new Error(await response.text())
  const settings = (await response.json()) as {
    config: Config
    defaults: Config
    themes: BuiltinTheme[]
    platform: string
    version: string
    defaultShell: string
  }
  const known = platforms.find((item) => item.value === settings.platform)
  if (!known) throw new Error(`unsupported platform ${settings.platform}`)
  return { ...settings, platform: known.value }
}

function zshOptionsSupported(options: string[]) {
  for (let position = 0; position < options.length; position++) {
    const word = options[position]
    if (!word.startsWith('-') && !word.startsWith('+')) return false
    const enable = word.startsWith('-')
    const flags = word.slice(1)
    if (flags === '' || flags === '-') return false
    if (flags.startsWith('-')) {
      if (!zshOptionAllowed(flags.slice(1), enable)) return false
      continue
    }
    for (let index = 0; index < flags.length; index++) {
      const letter = flags[index]
      if (letter === 'o') {
        let name = flags.slice(index + 1)
        if (name === '') {
          position++
          if (position === options.length) return false
          name = options[position]
        }
        if (!zshOptionAllowed(name, enable)) return false
        break
      }
      if (letter === 'b' || letter === 'c') return false
      if (enable && 'dfnprvx'.includes(letter)) return false
      if (!enable && letter === 'i') return false
    }
  }
  return true
}

function zshOptionAllowed(option: string, enable: boolean) {
  let name = option.toLowerCase().replace(/[-_]/g, '')
  let value = enable
  if (name.startsWith('no')) {
    name = name.slice(2)
    value = !enable
  }
  if (['rcs', 'globalrcs', 'interactive', 'exec'].includes(name)) return value
  if (
    ['privileged', 'restricted', 'sourcetrace', 'verbose', 'xtrace'].includes(
      name
    )
  )
    return !value
  return true
}

export function shellIntegrationIssue(
  command: string | null,
  platform: Platform,
  defaultShell: string
) {
  if (platform === 'windows') return 'Not available on Windows'
  if (command !== null && /[\n"'\\$`;&|<>()*?[\]{}#!]/.test(command))
    return 'Not available for commands with shell syntax'
  const words =
    command === null
      ? [defaultShell]
      : command.split(/[ \t]/).filter((word) => word !== '')
  if (words.length === 0) return 'Available for bash, zsh and fish'
  const path = words[0]
  const name = path.split('/').pop()
  const options = words.slice(1)
  if (name === 'bash') {
    if (platform === 'macos' && (path === '/bin/bash' || !path.includes('/')))
      return 'Needs a newer bash than the one macOS includes'
    if (options.every((option) => ['-l', '--login', '-i'].includes(option)))
      return null
    return 'Not available with these bash options'
  }
  if (name === 'zsh') {
    if (zshOptionsSupported(options)) return null
    return 'Not available with these zsh options'
  }
  if (name === 'fish') {
    const supported = options.every((option) => {
      if (option.startsWith('--')) {
        const name = option.slice(2).split('=')[0]
        return (
          name === '' ||
          !['command', 'no-config', 'no-execute'].some((long) =>
            long.startsWith(name)
          )
        )
      }
      return !(option.startsWith('-') && /[cNn]/.test(option))
    })
    if (supported) return null
    return 'Not available with these fish options'
  }
  return 'Available for bash, zsh and fish'
}

export async function saveConfig(config: Config) {
  const response = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as Config
}

export async function uploadBackground(file: File) {
  const response = await fetch('/api/background', {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) throw new Error(await response.text())
  return response.text()
}

export async function removeBackground() {
  const response = await fetch('/api/background', { method: 'DELETE' })
  if (!response.ok) throw new Error(await response.text())
}

export async function applyStyle(config: Config) {
  const font = `${config.font.size}px ${config.font.family}`
  await Promise.all([
    document.fonts.load(font),
    document.fonts.load(`bold ${font}`),
  ])
  const colors = themeColors(config.theme)
  const style = document.documentElement.style
  style.setProperty('--bg', colors.background)
  style.setProperty('--text', colors.foreground)
  style.setProperty('--brand', colors.palette[4])
  style.setProperty('--danger', colors.palette[1])
  style.setProperty('--pad-top', `${config.padding.top}px`)
  style.setProperty('--pad-right', `${config.padding.right}px`)
  style.setProperty('--pad-bottom', `${config.padding.bottom}px`)
  style.setProperty('--pad-left', `${config.padding.left}px`)
}

export function terminalOptions(
  config: Config,
  version: string
): TerminalOptions {
  return {
    fontFamily: config.font.family,
    fontSize: config.font.size,
    lineHeight: config.font.lineHeight,
    ligatures: config.font.ligatures,
    cursorStyle: config.cursor.style,
    cursorBlink: config.cursor.blink,
    scrollback: config.scrollback,
    boldIsBright: config.theme.boldIsBright,
    colors: themeColors(config.theme),
    version: terminalVersion(config.behavior.terminalIdentity, version),
    commandMarks: config.behavior.commandMarks,
    clickToMoveCursor: config.behavior.clickToMoveCursor,
    optionAsMeta: config.behavior.optionAsMeta,
    promptEvents: config.behavior.clipboardRead !== 'deny',
  }
}

function terminalVersion(identity: TerminalIdentity, version: string) {
  if (identity === 'sshtty') return `sshtty ${version}`
  if (identity === 'iterm2') return `iTerm2 ${iterm2Version}`
  throw new Error(`unknown terminal identity ${identity}`)
}
