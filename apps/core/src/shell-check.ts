import type { Platform } from './config.ts'

function zshOptionsSupported(options: string[]) {
  for (let position = 0; position < options.length; position++) {
    const word = options[position]
    if (!word.startsWith('-') && !word.startsWith('+')) {
      return false
    }
    const enable = word.startsWith('-')
    const flags = word.slice(1)
    if (flags === '' || flags === '-') {
      return false
    }
    if (flags.startsWith('-')) {
      if (!zshOptionAllowed(flags.slice(1), enable)) {
        return false
      }
      continue
    }
    for (let index = 0; index < flags.length; index++) {
      const letter = flags[index]
      if (letter === 'o') {
        let name = flags.slice(index + 1)
        if (name === '') {
          position++
          if (position === options.length) {
            return false
          }
          name = options[position]
        }
        if (!zshOptionAllowed(name, enable)) {
          return false
        }
        break
      }
      if (letter === 'b' || letter === 'c') {
        return false
      }
      if (enable && 'dfnprvx'.includes(letter)) {
        return false
      }
      if (!enable && letter === 'i') {
        return false
      }
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
  if (['rcs', 'globalrcs', 'interactive', 'exec'].includes(name)) {
    return value
  }
  if (
    ['privileged', 'restricted', 'sourcetrace', 'verbose', 'xtrace'].includes(
      name
    )
  ) {
    return !value
  }
  return true
}

export function shellIntegrationIssue(
  command: string | null,
  platform: Platform,
  defaultShell: string
) {
  if (platform === 'windows') {
    return 'Not available on Windows'
  }
  if (command !== null && /[\n"'\\$`;&|<>()*?[\]{}#!]/.test(command)) {
    return 'Not available for commands with shell syntax'
  }
  const words =
    command === null
      ? [defaultShell]
      : command.split(/[ \t]/).filter((word) => word !== '')
  if (words.length === 0) {
    return 'Available for bash, zsh and fish'
  }
  const path = words[0]
  const name = path.split('/').pop()
  const options = words.slice(1)
  if (name === 'bash') {
    if (platform === 'macos' && (path === '/bin/bash' || !path.includes('/'))) {
      return 'Needs a newer bash than the one macOS includes'
    }
    if (options.every((option) => ['-l', '--login', '-i'].includes(option))) {
      return null
    }
    return 'Not available with these bash options'
  }
  if (name === 'zsh') {
    if (zshOptionsSupported(options)) {
      return null
    }
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
    if (supported) {
      return null
    }
    return 'Not available with these fish options'
  }
  return 'Available for bash, zsh and fish'
}
