import type { Platform, TerminalIdentity } from '@offsite/core/config'
import type { TerminalOptions } from '@/lib/ghostty/terminal'
import { fontFamily, type TerminalPrefs } from '@/lib/prefs'
import { currentScheme } from '@/lib/theme'

const iterm2Version = '3.6.8'
const ghosttyVersion = '1.3.1'

export const platforms: { value: Platform; label: string }[] = [
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'windows', label: 'Windows' },
]

export async function applyStyle(config: TerminalPrefs) {
  const font = `${config.font.size}px ${fontFamily(config.font.family)}`
  await Promise.all([
    document.fonts.load(font),
    document.fonts.load(`bold ${font}`),
  ])
  const style = document.documentElement.style
  style.setProperty('--pad-top', `${config.padding.top}px`)
  style.setProperty('--pad-right', `${config.padding.right}px`)
  style.setProperty('--pad-bottom', `${config.padding.bottom}px`)
  style.setProperty('--pad-left', `${config.padding.left}px`)
}

export function terminalOptions(
  config: TerminalPrefs,
  identity: TerminalIdentity
): TerminalOptions {
  const scheme = currentScheme()
  return {
    fontFamily: fontFamily(config.font.family),
    fontSize: config.font.size,
    lineHeight: config.font.lineHeight,
    ligatures: config.font.ligatures,
    cursorStyle: config.cursor.style,
    cursorBlink: config.cursor.blink,
    scrollback: config.scrollback,
    boldIsBright: config.boldIsBright,
    colors: {
      background: scheme.background,
      foreground: scheme.foreground,
      cursor: scheme.cursor,
      cursorText: scheme.background,
      selectionBackground: scheme.selectionBackground,
      selectionForeground: scheme.foreground,
      palette: scheme.palette,
    },
    version: terminalVersion(identity),
    clickToMoveCursor: config.behavior.clickToMoveCursor,
    optionAsMeta: config.behavior.optionAsMeta,
    windowsCopyPaste: config.behavior.windowsCopyPaste,
  }
}

function terminalVersion(identity: TerminalIdentity) {
  if (identity === 'offsite') {
    return 'offsite 0.0.0'
  }
  if (identity === 'ghostty') {
    return `ghostty ${ghosttyVersion}`
  }
  if (identity === 'iterm2') {
    return `iTerm2 ${iterm2Version}`
  }
  throw new Error(`unknown terminal identity ${identity}`)
}
