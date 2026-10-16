import { schemes } from '@server/schemes'

export type Prefs = {
  theme: string
  terminal: {
    font: {
      family: string
      size: number
      lineHeight: number
      ligatures: boolean
    }
    cursor: { style: 'block' | 'bar' | 'underline'; blink: boolean }
    padding: { top: number; right: number; bottom: number; left: number }
    scrollback: number
    boldIsBright: boolean
    behavior: {
      modernizeShiftEnter: boolean
      pasteBrowserImages: boolean
      captureShortcuts: boolean
      bellFlash: boolean
      bellSound: boolean
      clickToMoveCursor: boolean
      optionAsMeta: 'off' | 'left' | 'right' | 'both'
      confirmCloseBusyTab: boolean
    }
  }
  diff: { split: boolean; wrap: boolean }
}

export type TerminalPrefs = Prefs['terminal']

const storageKey = 'prefs'

export const defaultPrefs: Prefs = {
  theme: schemes[0].id,
  terminal: {
    font: {
      family: 'FiraCode Nerd Font',
      size: 14,
      lineHeight: 1.35,
      ligatures: true,
    },
    cursor: { style: 'bar', blink: true },
    padding: { top: 4, right: 4, bottom: 0, left: 4 },
    scrollback: 1000,
    boldIsBright: true,
    behavior: {
      modernizeShiftEnter: true,
      pasteBrowserImages: true,
      captureShortcuts: true,
      bellFlash: true,
      bellSound: true,
      clickToMoveCursor: true,
      optionAsMeta: 'off',
      confirmCloseBusyTab: true,
    },
  },
  diff: { split: false, wrap: true },
}

const choices: Record<string, string[]> = {
  theme: schemes.map((scheme) => scheme.id),
  'terminal.cursor.style': ['block', 'bar', 'underline'],
  'terminal.behavior.optionAsMeta': ['off', 'left', 'right', 'both'],
}

export function loadPrefs(): Prefs {
  const raw = localStorage.getItem(storageKey)
  if (raw === null) return structuredClone(defaultPrefs)
  return merge(defaultPrefs, JSON.parse(raw), '') as Prefs
}

export function savePrefs(prefs: Prefs) {
  localStorage.setItem(storageKey, JSON.stringify(prefs))
}

function merge(template: unknown, stored: unknown, key: string): unknown {
  if (isObject(template))
    return Object.fromEntries(
      Object.entries(template).map((entry) => [
        entry[0],
        merge(
          entry[1],
          isObject(stored) ? stored[entry[0]] : undefined,
          key === '' ? entry[0] : `${key}.${entry[0]}`
        ),
      ])
    )
  if (typeof stored !== typeof template) return template
  if (key in choices && !choices[key].includes(stored as string))
    return template
  return stored
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
