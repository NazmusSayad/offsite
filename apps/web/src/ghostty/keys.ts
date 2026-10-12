const ghosttyKeyboardCodes = [
  'Unidentified',
  'Backquote',
  'Backslash',
  'BracketLeft',
  'BracketRight',
  'Comma',
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
  'Equal',
  'IntlBackslash',
  'IntlRo',
  'IntlYen',
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyM',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',
  'Minus',
  'Period',
  'Quote',
  'Semicolon',
  'Slash',
  'AltLeft',
  'AltRight',
  'Backspace',
  'CapsLock',
  'ContextMenu',
  'ControlLeft',
  'ControlRight',
  'Enter',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'Tab',
  'Convert',
  'KanaMode',
  'NonConvert',
  'Delete',
  'End',
  'Help',
  'Home',
  'Insert',
  'PageDown',
  'PageUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'NumLock',
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'NumpadAdd',
  'NumpadBackspace',
  'NumpadClear',
  'NumpadClearEntry',
  'NumpadComma',
  'NumpadDecimal',
  'NumpadDivide',
  'NumpadEnter',
  'NumpadEqual',
  'NumpadMemoryAdd',
  'NumpadMemoryClear',
  'NumpadMemoryRecall',
  'NumpadMemoryStore',
  'NumpadMemorySubtract',
  'NumpadMultiply',
  'NumpadParenLeft',
  'NumpadParenRight',
  'NumpadSubtract',
  'NumpadSeparator',
  'NumpadArrowUp',
  'NumpadArrowDown',
  'NumpadArrowRight',
  'NumpadArrowLeft',
  'NumpadBegin',
  'NumpadHome',
  'NumpadEnd',
  'NumpadInsert',
  'NumpadDelete',
  'NumpadPageUp',
  'NumpadPageDown',
  'Escape',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
  'F21',
  'F22',
  'F23',
  'F24',
  'F25',
  'Fn',
  'FnLock',
  'PrintScreen',
  'ScrollLock',
  'Pause',
  'BrowserBack',
  'BrowserFavorites',
  'BrowserForward',
  'BrowserHome',
  'BrowserRefresh',
  'BrowserSearch',
  'BrowserStop',
  'Eject',
  'LaunchApp1',
  'LaunchApp2',
  'LaunchMail',
  'MediaPlayPause',
  'MediaSelect',
  'MediaStop',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'Power',
  'Sleep',
  'AudioVolumeDown',
  'AudioVolumeMute',
  'AudioVolumeUp',
  'WakeUp',
  'Copy',
  'Cut',
  'Paste',
] as const

const codeToGhosttyKey = new Map<string, number>(
  ghosttyKeyboardCodes.map((code, index) => [code, index])
)

export function ghosttyKeyForCode(code: string): number {
  return codeToGhosttyKey.get(code) ?? 0
}

export interface GhosttyKeyboardLayoutMap {
  get(code: string): string | undefined
}

const shiftedToUnshiftedCharacter = new Map<string, string>([
  ['!', '1'],
  ['@', '2'],
  ['#', '3'],
  ['$', '4'],
  ['%', '5'],
  ['^', '6'],
  ['&', '7'],
  ['*', '8'],
  ['(', '9'],
  [')', '0'],
  ['~', '`'],
  ['_', '-'],
  ['+', '='],
  ['{', '['],
  ['}', ']'],
  ['|', '\\'],
  [':', ';'],
  ['"', "'"],
  ['<', ','],
  ['>', '.'],
  ['?', '/'],
])

let keyboardLayoutMapPromise:
  | Promise<GhosttyKeyboardLayoutMap | undefined>
  | undefined

export function loadGhosttyKeyboardLayoutMap(): Promise<
  GhosttyKeyboardLayoutMap | undefined
> {
  if (keyboardLayoutMapPromise) return keyboardLayoutMapPromise
  const browserNavigator = globalThis.navigator as
    | (Navigator & {
        readonly keyboard?: {
          getLayoutMap(): Promise<GhosttyKeyboardLayoutMap>
        }
      })
    | undefined
  const keyboard = browserNavigator?.keyboard
  const promise =
    keyboard?.getLayoutMap().catch(() => undefined) ??
    Promise.resolve(undefined)
  keyboardLayoutMapPromise = promise
  return promise
}

export function ghosttyConsumedMods(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >
): number {
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
    return 0
  return [...event.key].length === 1 ? 1 : 0
}

export function ghosttyUnshiftedCodepoint(
  event: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'>,
  layoutMap?: GhosttyKeyboardLayoutMap
): number {
  if ([...event.key].length !== 1) return 0
  const layoutCharacter = layoutMap?.get(event.code)
  if (layoutCharacter && [...layoutCharacter].length === 1) {
    return layoutCharacter.codePointAt(0) ?? 0
  }
  if (/^[A-Z]$/u.test(event.key)) return event.key.charCodeAt(0) + 32
  if (event.shiftKey) {
    const unshiftedCharacter = shiftedToUnshiftedCharacter.get(event.key)
    if (unshiftedCharacter) return unshiftedCharacter.codePointAt(0) ?? 0
    const lowercase = event.key.toLowerCase()
    if (lowercase !== event.key && [...lowercase].length === 1) {
      return lowercase.codePointAt(0) ?? 0
    }
    return 0
  }
  return event.key.codePointAt(0) ?? 0
}

const usPunctuationCharacter = new Map([
  ['Backquote', '`'],
  ['Minus', '-'],
  ['Equal', '='],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Backslash', '\\'],
  ['Semicolon', ';'],
  ['Quote', "'"],
  ['Comma', ','],
  ['Period', '.'],
  ['Slash', '/'],
  ['Space', ' '],
])

const unshiftedToShiftedCharacter = new Map(
  [...shiftedToUnshiftedCharacter].map((entry) => [entry[1], entry[0]])
)

function usUnshiftedCharacter(code: string) {
  if (/^Key[A-Z]$/u.test(code)) return code[3].toLowerCase()
  if (/^Digit[0-9]$/u.test(code)) return code[5]
  return usPunctuationCharacter.get(code)
}

export function ghosttyMetaText(
  event: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'>,
  layoutMap?: GhosttyKeyboardLayoutMap
): string {
  const layoutCharacter = layoutMap?.get(event.code)
  const unshifted =
    layoutCharacter && [...layoutCharacter].length === 1
      ? layoutCharacter
      : usUnshiftedCharacter(event.code)
  if (unshifted === undefined) return event.key
  if (!event.shiftKey) return unshifted
  const uppercase = unshifted.toUpperCase()
  if (uppercase !== unshifted) return uppercase
  return unshiftedToShiftedCharacter.get(unshifted) ?? unshifted
}

export function macosEditingInput(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >
): string | null {
  if (event.ctrlKey || event.shiftKey) return null
  if (event.metaKey && !event.altKey) {
    if (event.key === 'ArrowLeft') return '\x01'
    if (event.key === 'ArrowRight') return '\x05'
    if (event.key === 'Backspace') return '\x15'
    return null
  }
  if (event.altKey && !event.metaKey) {
    if (event.key === 'ArrowLeft') return '\x1bb'
    if (event.key === 'ArrowRight') return '\x1bf'
    return null
  }
  return null
}
