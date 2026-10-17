import { ghostty } from './runtime'

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
  keyboardLayoutMapPromise =
    browserNavigator?.keyboard?.getLayoutMap().catch(() => undefined) ??
    Promise.resolve(undefined)
  return keyboardLayoutMapPromise
}

export function refreshGhosttyKeyboardLayoutMap() {
  keyboardLayoutMapPromise = undefined
  return loadGhosttyKeyboardLayoutMap()
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

const usDigitCharacter = [...'0123456789'].map((digit) => [
  `Digit${digit}`,
  digit,
])

const unshiftedToShiftedCharacter = new Map(
  [...shiftedToUnshiftedCharacter].map((entry) => [entry[1], entry[0]])
)

function usUnshiftedCharacter(code: string) {
  if (/^Key[A-Z]$/u.test(code)) return code[3].toLowerCase()
  if (/^Digit[0-9]$/u.test(code)) return code[5]
  return usPunctuationCharacter.get(code)
}

function isUsLayout(layoutMap: GhosttyKeyboardLayoutMap) {
  return [...usPunctuationCharacter, ...usDigitCharacter].every(
    (entry) => entry[0] === 'Space' || layoutMap.get(entry[0]) === entry[1]
  )
}

export function ghosttyMetaText(
  event: Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey'>,
  layoutMap?: GhosttyKeyboardLayoutMap
): string | null {
  const layoutCharacter = layoutMap?.get(event.code)
  const unshifted =
    layoutCharacter && [...layoutCharacter].length === 1
      ? layoutCharacter
      : usUnshiftedCharacter(event.code)
  if (unshifted === undefined)
    return [...event.key].length === 1 ? null : event.key
  if (!event.shiftKey) return unshifted
  const uppercase = unshifted.toUpperCase()
  if (uppercase !== unshifted && [...uppercase].length === 1) return uppercase
  if (layoutMap === undefined || !isUsLayout(layoutMap)) return null
  return unshiftedToShiftedCharacter.get(unshifted) ?? unshifted
}

export type MouseInput = {
  action: 'press' | 'release' | 'motion'
  button: number | null
  mods: number
  x: number
  y: number
  screenWidth: number
  screenHeight: number
  cellWidth: number
  cellHeight: number
  anyButtonPressed: boolean
}

const encoder = new TextEncoder()
const LEGACY_CONTROL_KEYS = new Map([
  ['[', '\x1b'],
  ['m', '\r'],
  ['i', '\t'],
  ['@', '\x00'],
])

export class InputEncoder {
  private readonly runtime = ghostty()
  private readonly terminal: number
  private readonly keyEncoderSlot: number
  private readonly keyEncoder: number
  private readonly keyEventSlot: number
  private readonly keyEvent: number
  private readonly mouseEncoderSlot: number
  private readonly mouseEncoder: number
  private readonly mouseEventSlot: number
  private readonly mouseEvent: number
  private readonly scratch: number
  private keyboardLayoutMap: GhosttyKeyboardLayoutMap | undefined

  constructor(terminal: number) {
    const runtime = this.runtime
    this.terminal = terminal
    void this.loadKeyboardLayout(loadGhosttyKeyboardLayoutMap())
    this.keyEncoderSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_key_encoder_new',
      runtime.call('ghostty_key_encoder_new', 0, this.keyEncoderSlot)
    )
    this.keyEncoder = runtime.readPointer(this.keyEncoderSlot)
    this.keyEventSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_key_event_new',
      runtime.call('ghostty_key_event_new', 0, this.keyEventSlot)
    )
    this.keyEvent = runtime.readPointer(this.keyEventSlot)
    this.mouseEncoderSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_mouse_encoder_new',
      runtime.call('ghostty_mouse_encoder_new', 0, this.mouseEncoderSlot)
    )
    this.mouseEncoder = runtime.readPointer(this.mouseEncoderSlot)
    this.mouseEventSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_mouse_event_new',
      runtime.call('ghostty_mouse_event_new', 0, this.mouseEventSlot)
    )
    this.mouseEvent = runtime.readPointer(this.mouseEventSlot)
    this.scratch = runtime.alloc(1)
  }

  encodeKey(
    event: KeyboardEvent,
    action: 'press' | 'release' = 'press',
    optionAsMeta = false
  ) {
    const runtime = this.runtime
    const key = event.key.toLowerCase()
    const control = LEGACY_CONTROL_KEYS.get(key)
    if (
      control !== undefined &&
      action === 'press' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !(event.shiftKey && /^[a-z]$/u.test(key)) &&
      !runtime.flag('ghostty_terminal_get', this.terminal, 8)
    )
      return control
    const metaText = optionAsMeta ? this.metaText(event) : null
    const text = metaText ?? event.key
    if (
      metaText !== null &&
      action === 'press' &&
      !event.ctrlKey &&
      [...text].length === 1 &&
      (text.codePointAt(0) ?? 0) > 0x7f &&
      runtime.flag('ghostty_terminal_mode_get', this.terminal, 1036) &&
      this.isLegacyKeyboard()
    )
      return `\x1b${text}`
    runtime.call(
      'ghostty_key_encoder_setopt_from_terminal',
      this.keyEncoder,
      this.terminal
    )
    runtime.call(
      'ghostty_key_event_set_action',
      this.keyEvent,
      action === 'release' ? 0 : event.repeat ? 2 : 1
    )
    runtime.call(
      'ghostty_key_event_set_key',
      this.keyEvent,
      ghosttyKeyForCode(event.code)
    )
    const mods =
      (event.shiftKey ? 1 : 0) |
      (event.ctrlKey ? 1 << 1 : 0) |
      (event.altKey ? 1 << 2 : 0) |
      (event.metaKey ? 1 << 3 : 0) |
      (event.getModifierState('CapsLock') ? 1 << 4 : 0) |
      (event.getModifierState('NumLock') ? 1 << 5 : 0)
    runtime.call('ghostty_key_event_set_mods', this.keyEvent, mods)
    runtime.call(
      'ghostty_key_event_set_consumed_mods',
      this.keyEvent,
      ghosttyConsumedMods(event)
    )
    runtime.call(
      'ghostty_key_event_set_composing',
      this.keyEvent,
      event.isComposing ? 1 : 0
    )
    runtime.call(
      'ghostty_key_event_set_unshifted_codepoint',
      this.keyEvent,
      ghosttyUnshiftedCodepoint(
        { code: event.code, key: text, shiftKey: event.shiftKey },
        this.keyboardLayoutMap
      )
    )
    const textBytes = encoder.encode(text.length === 1 ? text : '')
    const textPointer =
      textBytes.length === 0 ? 0 : runtime.alloc(textBytes.length)
    if (textPointer !== 0)
      runtime.bytes(textPointer, textBytes.length).set(textBytes)
    runtime.call(
      'ghostty_key_event_set_utf8',
      this.keyEvent,
      textPointer,
      textBytes.length
    )
    const encoded = runtime.encodeOutput((output, size, written) =>
      runtime.call(
        'ghostty_key_encoder_encode',
        this.keyEncoder,
        this.keyEvent,
        output,
        size,
        written
      )
    )
    if (textPointer !== 0) runtime.free(textPointer, textBytes.length)
    return encoded
  }

  metaText(event: KeyboardEvent) {
    return ghosttyMetaText(event, this.keyboardLayoutMap)
  }

  refreshKeyboardLayout() {
    void this.loadKeyboardLayout(refreshGhosttyKeyboardLayoutMap())
  }

  encodePaste(data: string) {
    const runtime = this.runtime
    const input = encoder.encode(data)
    if (input.length === 0) return ''
    const pointer = runtime.alloc(input.length)
    runtime.bytes(pointer, input.length).set(input)
    const bracketed = runtime.flag(
      'ghostty_terminal_mode_get',
      this.terminal,
      2004
    )
      ? 1
      : 0
    const encoded = runtime.encodeOutput((output, size, written) =>
      runtime.call(
        'ghostty_paste_encode',
        pointer,
        input.length,
        bracketed,
        output,
        size,
        written
      )
    )
    runtime.free(pointer, input.length)
    return encoded
  }

  encodeMouse(input: MouseInput) {
    const runtime = this.runtime
    runtime.call(
      'ghostty_mouse_encoder_setopt_from_terminal',
      this.mouseEncoder,
      this.terminal
    )
    const sizeLayout = runtime.layout('GhosttyMouseEncoderSize')
    const size = runtime.alloc(sizeLayout.size)
    for (const field of [
      ['size', sizeLayout.size],
      ['screen_width', input.screenWidth],
      ['screen_height', input.screenHeight],
      ['cell_width', input.cellWidth],
      ['cell_height', input.cellHeight],
      ['padding_top', 0],
      ['padding_bottom', 0],
      ['padding_right', 0],
      ['padding_left', 0],
    ] as const) {
      runtime.setField(
        size,
        'GhosttyMouseEncoderSize',
        field[0],
        Math.max(0, Math.round(field[1]))
      )
    }
    runtime.call('ghostty_mouse_encoder_setopt', this.mouseEncoder, 2, size)
    runtime.free(size, sizeLayout.size)
    runtime.bytes(this.scratch, 1)[0] = input.anyButtonPressed ? 1 : 0
    runtime.call(
      'ghostty_mouse_encoder_setopt',
      this.mouseEncoder,
      3,
      this.scratch
    )
    runtime.bytes(this.scratch, 1)[0] = 1
    runtime.call(
      'ghostty_mouse_encoder_setopt',
      this.mouseEncoder,
      4,
      this.scratch
    )
    runtime.call(
      'ghostty_mouse_event_set_action',
      this.mouseEvent,
      { press: 0, release: 1, motion: 2 }[input.action]
    )
    if (input.button === null)
      runtime.call('ghostty_mouse_event_clear_button', this.mouseEvent)
    else
      runtime.call(
        'ghostty_mouse_event_set_button',
        this.mouseEvent,
        input.button
      )
    runtime.call('ghostty_mouse_event_set_mods', this.mouseEvent, input.mods)
    const positionLayout = runtime.layout('GhosttyMousePosition')
    const position = runtime.alloc(positionLayout.size)
    const positionView = runtime.view(position, positionLayout.size)
    positionView.setFloat32(
      runtime.field('GhosttyMousePosition', 'x').offset,
      input.x,
      true
    )
    positionView.setFloat32(
      runtime.field('GhosttyMousePosition', 'y').offset,
      input.y,
      true
    )
    runtime.call('ghostty_mouse_event_set_position', this.mouseEvent, position)
    runtime.free(position, positionLayout.size)
    return runtime.encodeOutput((output, outputSize, written) =>
      runtime.call(
        'ghostty_mouse_encoder_encode',
        this.mouseEncoder,
        this.mouseEvent,
        output,
        outputSize,
        written
      )
    )
  }

  dispose() {
    const runtime = this.runtime
    runtime.call('ghostty_mouse_event_free', this.mouseEvent)
    runtime.call('ghostty_mouse_encoder_free', this.mouseEncoder)
    runtime.call('ghostty_key_event_free', this.keyEvent)
    runtime.call('ghostty_key_encoder_free', this.keyEncoder)
    runtime.free(this.scratch, 1)
    runtime.freeOpaque(this.mouseEventSlot)
    runtime.freeOpaque(this.mouseEncoderSlot)
    runtime.freeOpaque(this.keyEventSlot)
    runtime.freeOpaque(this.keyEncoderSlot)
  }

  private async loadKeyboardLayout(
    loading: Promise<GhosttyKeyboardLayoutMap | undefined>
  ) {
    this.keyboardLayoutMap = await loading
  }

  private isLegacyKeyboard() {
    return (
      this.encodeKey(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          code: 'Tab',
          shiftKey: true,
        })
      ) === '\x1b[Z'
    )
  }
}
