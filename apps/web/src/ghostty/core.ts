import {
  type GhosttyKeyboardLayoutMap,
  ghosttyConsumedMods,
  ghosttyKeyForCode,
  ghosttyMetaText,
  ghosttyUnshiftedCodepoint,
  loadGhosttyKeyboardLayoutMap,
  refreshGhosttyKeyboardLayoutMap,
} from './keys'
import { ghostty, type SizeReport, type TerminalHost } from './runtime'

const SUCCESS = 0
const OUT_OF_SPACE = -3
const SELECTION_FORMAT_OPTIONS_SIZE = 16
const STYLE_FOREGROUND_TAG = 8
const STYLE_FOREGROUND_INDEX = 16
const STYLE_COLOR_PALETTE = 1
const STYLE_COLOR_RGB = 2
const STYLE_COLOR_VALUE = 8
const PAGE_BYTES = 589_824
const PAGE_GRID_BYTES = 381_888
const SCROLLBACK_MAX_BYTES = 50_000_000
const KITTY_STORAGE_LIMIT = 26
const KITTY_GRAPHICS = 30
const KITTY_PLACEMENTS = 1
const KITTY_PLACEMENT = {
  imageId: 1,
  isVirtual: 3,
  xOffset: 4,
  yOffset: 5,
  z: 12,
} as const
const KITTY_IMAGE = {
  width: 3,
  height: 4,
  format: 5,
  data: 7,
  length: 8,
} as const
const KITTY_RENDER_INFO = {
  size: 48,
  pixelWidth: 4,
  pixelHeight: 8,
  column: 20,
  row: 24,
  visible: 28,
  sourceX: 32,
  sourceY: 36,
  sourceWidth: 40,
  sourceHeight: 44,
} as const

const RENDER_DATA = {
  cols: 1,
  rows: 2,
  dirty: 3,
  rowIterator: 4,
  background: 5,
  foreground: 6,
  cursor: 7,
  cursorHasValue: 8,
  cursorStyle: 10,
  cursorVisible: 11,
  cursorBlinking: 12,
  cursorInViewport: 14,
  cursorX: 15,
  cursorY: 16,
} as const

const ROW_DATA = { dirty: 1, raw: 2, cells: 3 } as const

const CELL_DATA = {
  raw: 1,
  style: 2,
  graphemesLength: 3,
  graphemes: 4,
  background: 5,
  foreground: 6,
  selected: 7,
} as const

const CELL_QUERY = {
  keys: 0,
  values: 20,
  graphemesLength: 40,
  selected: 44,
  background: 48,
  foreground: 52,
  written: 56,
  size: 60,
} as const

export const CELL_WIDE = { narrow: 0, wide: 1, spacerTail: 2 } as const

export type Color = { r: number; g: number; b: number }

export type Colors = {
  foreground: Color
  background: Color
  cursor: Color
  palette: Color[]
}

export type CursorStyle = 'block' | 'bar' | 'underline'

export type Cell = {
  text: string
  wide: number
  foreground: Color
  background: Color
  bold: boolean
  italic: boolean
  invisible: boolean
  strikethrough: boolean
  overline: boolean
  underline: number
  underlineColor: Color | null
  selected: boolean
}

export type Row = {
  cells: Cell[]
  isWrapContinuation: boolean
  wrapsToNext: boolean
}

export type Snapshot = {
  cols: number
  rows: number
  foreground: Color
  background: Color
  cursor: Color
  cursorX: number
  cursorY: number
  cursorVisible: boolean
  cursorBlinking: boolean
  cursorStyle: number
  dirtyRows: Set<number>
  rowData: Row[]
}

export type Point = { x: number; y: number }

export type KittyPlacement = {
  key: string
  z: number
  column: number
  row: number
  xOffset: number
  yOffset: number
  width: number
  height: number
  source: { x: number; y: number; width: number; height: number }
  image: { width: number; height: number; format: number; pixels: Uint8Array }
}

export type Scrollbar = { total: number; offset: number; len: number }

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

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const LEGACY_CONTROL_KEYS = new Map([
  ['[', '\x1b'],
  ['m', '\r'],
  ['i', '\t'],
  ['@', '\x00'],
])

function channel(front: number, back: number) {
  return Math.floor((front * 155 + back * 100) / 255)
}

function blend(foreground: Color, background: Color): Color {
  return {
    r: channel(foreground.r, background.r),
    g: channel(foreground.g, background.g),
    b: channel(foreground.b, background.b),
  }
}

function cellText(view: DataView, length: number) {
  let text = ''
  for (let start = 0; start < length; start += 4096) {
    const count = Math.min(4096, length - start)
    const codes = new Array<number>(count)
    for (let index = 0; index < count; index += 1)
      codes[index] = view.getUint32((start + index) * 4, true)
    text += String.fromCodePoint(...codes)
  }
  return text
}

function fullPalette(base: Color[]) {
  const palette = [...base]
  const levels = [0, 95, 135, 175, 215, 255]
  for (let index = 16; index < 232; index += 1) {
    const value = index - 16
    palette.push({
      r: levels[Math.floor(value / 36)],
      g: levels[Math.floor(value / 6) % 6],
      b: levels[value % 6],
    })
  }
  for (let index = 0; index < 24; index += 1) {
    const level = 8 + index * 10
    palette.push({ r: level, g: level, b: level })
  }
  return palette
}

export class GhosttyCore {
  private readonly runtime = ghostty()
  private readonly terminalSlot: number
  private readonly terminal: number
  private readonly renderStateSlot: number
  private readonly renderState: number
  private readonly rowIteratorSlot: number
  private readonly rowCellsSlot: number
  private readonly keyEncoderSlot: number
  private readonly keyEncoder: number
  private readonly keyEventSlot: number
  private readonly keyEvent: number
  private readonly mouseEncoderSlot: number
  private readonly mouseEncoder: number
  private readonly mouseEventSlot: number
  private readonly mouseEvent: number
  private readonly formatterSlot: number
  private readonly formatter: number
  private readonly scratch: number
  private readonly point: number
  private readonly style: number
  private readonly cellQuery: number
  private readonly scrollbar: number
  private readonly kittyIteratorSlot: number
  private readonly kittyInfo: number
  private readonly host: TerminalHost
  private hostId = 0
  private sizeReport: SizeReport
  private graphemes = 0
  private graphemeCapacity = 0
  private rows: Row[] = []
  private palette: Color[] = []
  private disposed = false
  private keyboardLayoutMap: GhosttyKeyboardLayoutMap | undefined
  private tail = [0, 0]
  boldIsBright = false
  kittyCommands = 0
  version = ''

  constructor(
    cols: number,
    rows: number,
    scrollback: number,
    onPtyData: (data: string) => void,
    onBell: () => void
  ) {
    const runtime = this.runtime
    void loadGhosttyKeyboardLayoutMap().then((layoutMap) => {
      this.keyboardLayoutMap = layoutMap
    })
    const optionsSize = runtime.layout('GhosttyTerminalOptions').size
    const options = runtime.alloc(optionsSize)
    runtime.setField(options, 'GhosttyTerminalOptions', 'cols', cols)
    runtime.setField(options, 'GhosttyTerminalOptions', 'rows', rows)
    const pageRows = Math.floor(PAGE_GRID_BYTES / (8 * (cols + 1)))
    runtime.setField(
      options,
      'GhosttyTerminalOptions',
      'max_scrollback',
      scrollback === 0
        ? 0
        : Math.min(
            (Math.ceil(scrollback / pageRows) + 1) * PAGE_BYTES,
            SCROLLBACK_MAX_BYTES
          )
    )
    this.terminalSlot = runtime.allocOpaque()
    const result = runtime.call(
      'ghostty_terminal_new',
      0,
      this.terminalSlot,
      options
    )
    runtime.free(options, optionsSize)
    this.check('ghostty_terminal_new', result)
    this.terminal = runtime.readPointer(this.terminalSlot)
    this.sizeReport = { rows, columns: cols, cellWidth: 1, cellHeight: 1 }
    this.host = {
      write: onPtyData,
      size: () => this.sizeReport,
      bell: onBell,
      version: () => this.version,
    }
    this.hostId = runtime.attachHost(this.terminal, this.host)

    this.renderStateSlot = runtime.allocOpaque()
    this.check(
      'ghostty_render_state_new',
      runtime.call('ghostty_render_state_new', 0, this.renderStateSlot)
    )
    this.renderState = runtime.readPointer(this.renderStateSlot)
    this.rowIteratorSlot = runtime.allocOpaque()
    this.check(
      'ghostty_render_state_row_iterator_new',
      runtime.call(
        'ghostty_render_state_row_iterator_new',
        0,
        this.rowIteratorSlot
      )
    )
    this.rowCellsSlot = runtime.allocOpaque()
    this.check(
      'ghostty_render_state_row_cells_new',
      runtime.call('ghostty_render_state_row_cells_new', 0, this.rowCellsSlot)
    )

    this.keyEncoderSlot = runtime.allocOpaque()
    this.check(
      'ghostty_key_encoder_new',
      runtime.call('ghostty_key_encoder_new', 0, this.keyEncoderSlot)
    )
    this.keyEncoder = runtime.readPointer(this.keyEncoderSlot)
    this.keyEventSlot = runtime.allocOpaque()
    this.check(
      'ghostty_key_event_new',
      runtime.call('ghostty_key_event_new', 0, this.keyEventSlot)
    )
    this.keyEvent = runtime.readPointer(this.keyEventSlot)

    this.mouseEncoderSlot = runtime.allocOpaque()
    this.check(
      'ghostty_mouse_encoder_new',
      runtime.call('ghostty_mouse_encoder_new', 0, this.mouseEncoderSlot)
    )
    this.mouseEncoder = runtime.readPointer(this.mouseEncoderSlot)
    this.mouseEventSlot = runtime.allocOpaque()
    this.check(
      'ghostty_mouse_event_new',
      runtime.call('ghostty_mouse_event_new', 0, this.mouseEventSlot)
    )
    this.mouseEvent = runtime.readPointer(this.mouseEventSlot)

    const formatterLayout = runtime.layout('GhosttyFormatterTerminalOptions')
    const formatterOptions = runtime.alloc(formatterLayout.size)
    const extra = runtime.field('GhosttyFormatterTerminalOptions', 'extra')
    const screen = runtime.field('GhosttyFormatterTerminalExtra', 'screen')
    runtime.setField(
      formatterOptions,
      'GhosttyFormatterTerminalOptions',
      'size',
      formatterLayout.size
    )
    runtime.setField(
      formatterOptions,
      'GhosttyFormatterTerminalOptions',
      'trim',
      1
    )
    runtime.setField(
      formatterOptions + extra.offset,
      'GhosttyFormatterTerminalExtra',
      'size',
      extra.size
    )
    runtime.setField(
      formatterOptions + extra.offset + screen.offset,
      'GhosttyFormatterScreenExtra',
      'size',
      screen.size
    )
    this.formatterSlot = runtime.allocOpaque()
    const formatterResult = runtime.call(
      'ghostty_formatter_terminal_new',
      0,
      this.formatterSlot,
      this.terminal,
      formatterOptions
    )
    runtime.free(formatterOptions, formatterLayout.size)
    this.check('ghostty_formatter_terminal_new', formatterResult)
    this.formatter = runtime.readPointer(this.formatterSlot)

    this.scratch = runtime.alloc(16)
    this.point = runtime.alloc(runtime.layout('GhosttyPoint').size)
    const styleSize = runtime.layout('GhosttyStyle').size
    this.style = runtime.alloc(styleSize)
    this.cellQuery = runtime.alloc(CELL_QUERY.size)
    const queryView = runtime.dataView()
    const cellFields = [
      [CELL_DATA.style, this.style],
      [CELL_DATA.graphemesLength, this.cellQuery + CELL_QUERY.graphemesLength],
      [CELL_DATA.selected, this.cellQuery + CELL_QUERY.selected],
      [CELL_DATA.background, this.cellQuery + CELL_QUERY.background],
      [CELL_DATA.foreground, this.cellQuery + CELL_QUERY.foreground],
    ] as const
    for (const [index, [key, pointer]] of cellFields.entries()) {
      queryView.setUint32(
        this.cellQuery + CELL_QUERY.keys + index * 4,
        key,
        true
      )
      queryView.setUint32(
        this.cellQuery + CELL_QUERY.values + index * 4,
        pointer,
        true
      )
    }
    this.scrollbar = runtime.alloc(
      runtime.layout('GhosttyTerminalScrollbar').size
    )
    if (
      runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        KITTY_STORAGE_LIMIT,
        this.scratch
      ) !== SUCCESS
    )
      throw new Error(
        'libghostty-vt was built without kitty graphics, build it with scripts/build-ghostty-wasm.mts'
      )
    this.kittyIteratorSlot = runtime.allocOpaque()
    this.check(
      'ghostty_kitty_graphics_placement_iterator_new',
      runtime.call(
        'ghostty_kitty_graphics_placement_iterator_new',
        0,
        this.kittyIteratorSlot
      )
    )
    this.kittyInfo = runtime.alloc(KITTY_RENDER_INFO.size)
  }

  write(data: Uint8Array) {
    if (data.length === 0) return
    this.noteKittyCommand(data)
    const pointer = this.runtime.alloc(data.length)
    this.runtime.bytes(pointer, data.length).set(data)
    this.runtime.call(
      'ghostty_terminal_vt_write',
      this.terminal,
      pointer,
      data.length
    )
    this.runtime.free(pointer, data.length)
  }

  setReplies(enabled: boolean) {
    if (enabled && this.hostId === 0) {
      this.hostId = this.runtime.attachHost(this.terminal, this.host)
      return
    }
    if (!enabled && this.hostId !== 0) {
      this.runtime.detachHost(this.terminal, this.hostId)
      this.hostId = 0
    }
  }

  reset() {
    this.runtime.call('ghostty_terminal_reset', this.terminal)
    this.rows = []
  }

  resize(
    cols: number,
    rows: number,
    cellWidth: number,
    cellHeight: number,
    pixelRatio: number
  ) {
    this.sizeReport = {
      rows,
      columns: cols,
      cellWidth: Math.max(1, Math.round(cellWidth * pixelRatio)),
      cellHeight: Math.max(1, Math.round(cellHeight * pixelRatio)),
    }
    this.check(
      'ghostty_terminal_resize',
      this.runtime.call(
        'ghostty_terminal_resize',
        this.terminal,
        Math.max(1, Math.min(65_535, cols)),
        Math.max(1, Math.min(65_535, rows)),
        this.sizeReport.cellWidth,
        this.sizeReport.cellHeight
      )
    )
  }

  setColors(colors: Colors) {
    const color = this.runtime.alloc(3)
    for (const [option, value] of [
      [11, colors.foreground],
      [12, colors.background],
      [13, colors.cursor],
    ] as const) {
      this.runtime.bytes(color, 3).set([value.r, value.g, value.b])
      this.runtime.call('ghostty_terminal_set', this.terminal, option, color)
    }
    this.runtime.free(color, 3)
    const palette = fullPalette(colors.palette)
    const pointer = this.runtime.alloc(palette.length * 3)
    this.runtime
      .bytes(pointer, palette.length * 3)
      .set(palette.flatMap((value) => [value.r, value.g, value.b]))
    this.runtime.call('ghostty_terminal_set', this.terminal, 14, pointer)
    this.runtime.free(pointer, palette.length * 3)
    this.rows = []
  }

  setCursor(style: CursorStyle, blink: boolean) {
    const value = { bar: 0, block: 1, underline: 2 }[style]
    this.runtime.view(this.scratch, 4).setUint32(0, value, true)
    this.runtime.call('ghostty_terminal_set', this.terminal, 22, this.scratch)
    this.runtime.bytes(this.scratch, 1)[0] = blink ? 1 : 0
    this.runtime.call('ghostty_terminal_set', this.terminal, 23, this.scratch)
  }

  title() {
    this.runtime.bytes(this.scratch, 8).fill(0)
    if (
      this.runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        12,
        this.scratch
      ) !== SUCCESS
    )
      return ''
    const view = this.runtime.view(this.scratch, 8)
    const pointer = view.getUint32(0, true)
    const length = view.getUint32(4, true)
    if (length === 0) return ''
    return decoder.decode(this.runtime.bytes(pointer, length))
  }

  screenText() {
    const output = this.runtime.alloc(8)
    const result = this.runtime.call(
      'ghostty_formatter_format_alloc',
      this.formatter,
      0,
      output,
      output + 4
    )
    const view = this.runtime.view(output, 8)
    const pointer = view.getUint32(0, true)
    const length = view.getUint32(4, true)
    this.runtime.free(output, 8)
    if (result !== SUCCESS) return ''
    const text = decoder.decode(this.runtime.bytes(pointer, length))
    this.runtime.call('ghostty_free', 0, pointer, length)
    return text
  }

  scroll(deltaRows: number) {
    const layout = this.runtime.layout('GhosttyTerminalScrollViewport')
    const scroll = this.runtime.alloc(layout.size)
    this.runtime.setField(scroll, 'GhosttyTerminalScrollViewport', 'tag', 2)
    const value = this.runtime.field('GhosttyTerminalScrollViewport', 'value')
    this.runtime
      .view(scroll + value.offset, value.size)
      .setInt32(0, deltaRows, true)
    this.runtime.call('ghostty_terminal_scroll_viewport', this.terminal, scroll)
    this.runtime.free(scroll, layout.size)
  }

  scrollToBottom() {
    const layout = this.runtime.layout('GhosttyTerminalScrollViewport')
    const scroll = this.runtime.alloc(layout.size)
    this.runtime.setField(scroll, 'GhosttyTerminalScrollViewport', 'tag', 1)
    this.runtime.call('ghostty_terminal_scroll_viewport', this.terminal, scroll)
    this.runtime.free(scroll, layout.size)
  }

  scrollbarState(): Scrollbar | null {
    const layout = this.runtime.layout('GhosttyTerminalScrollbar')
    this.runtime.bytes(this.scrollbar, layout.size).fill(0)
    if (
      this.runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        9,
        this.scrollbar
      ) !== SUCCESS
    )
      return null
    return {
      total: this.runtime.readField(
        this.scrollbar,
        'GhosttyTerminalScrollbar',
        'total'
      ),
      offset: this.runtime.readField(
        this.scrollbar,
        'GhosttyTerminalScrollbar',
        'offset'
      ),
      len: this.runtime.readField(
        this.scrollbar,
        'GhosttyTerminalScrollbar',
        'len'
      ),
    }
  }

  isMouseTracking() {
    return this.getFlag('ghostty_terminal_get', 11)
  }

  isMouseAnyEventTracking() {
    return this.getFlag('ghostty_terminal_mode_get', 1003)
  }

  isFocusReporting() {
    return this.getFlag('ghostty_terminal_mode_get', 1004)
  }

  isSynchronizedOutput() {
    return this.getFlag('ghostty_terminal_mode_get', 2026)
  }

  endSynchronizedOutput() {
    this.check(
      'ghostty_terminal_mode_set',
      this.runtime.call('ghostty_terminal_mode_set', this.terminal, 2026, 0)
    )
  }

  currentColors(): Colors {
    return {
      foreground: this.terminalColor(18),
      background: this.terminalColor(19),
      cursor: this.terminalColor(20),
      palette: this.readPalette(),
    }
  }

  isApplicationCursorKeys() {
    return this.getFlag('ghostty_terminal_mode_get', 1)
  }

  isKittyKeyboard() {
    return this.getFlag('ghostty_terminal_get', 8)
  }

  isPendingWrap() {
    return this.getFlag('ghostty_terminal_get', 5)
  }

  isAlternateScreen() {
    this.runtime.dataView().setUint32(this.scratch, 0, true)
    return (
      this.runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        6,
        this.scratch
      ) === SUCCESS &&
      this.runtime.dataView().getUint32(this.scratch, true) === 1
    )
  }

  encodeKey(
    event: KeyboardEvent,
    action: 'press' | 'release' = 'press',
    optionAsMeta = false
  ) {
    const key = event.key.toLowerCase()
    const control = LEGACY_CONTROL_KEYS.get(key)
    if (
      control !== undefined &&
      action === 'press' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !(event.shiftKey && /^[a-z]$/u.test(key)) &&
      !this.isKittyKeyboard()
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
      this.getFlag('ghostty_terminal_mode_get', 1036) &&
      this.isLegacyKeyboard()
    )
      return `\x1b${text}`
    const runtime = this.runtime
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
    const encoded = this.encodeOutput((output, size, written) =>
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
    void refreshGhosttyKeyboardLayoutMap().then((layoutMap) => {
      this.keyboardLayoutMap = layoutMap
    })
  }

  isLegacyKeyboard() {
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

  encodePaste(data: string) {
    const input = encoder.encode(data)
    if (input.length === 0) return ''
    const pointer = this.runtime.alloc(input.length)
    this.runtime.bytes(pointer, input.length).set(input)
    const bracketed = this.getFlag('ghostty_terminal_mode_get', 2004) ? 1 : 0
    const encoded = this.encodeOutput((output, size, written) =>
      this.runtime.call(
        'ghostty_paste_encode',
        pointer,
        input.length,
        bracketed,
        output,
        size,
        written
      )
    )
    this.runtime.free(pointer, input.length)
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
    for (const [field, value] of [
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
        field,
        Math.max(0, Math.round(value))
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
    return this.encodeOutput((output, outputSize, written) =>
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

  setSelection(start: Point, end: Point) {
    const layout = this.runtime.layout('GhosttySelection')
    const gridRefSize = this.runtime.layout('GhosttyGridRef').size
    const selection = this.runtime.alloc(layout.size)
    const startRef = this.gridRef(start.x, start.y, 2)
    const endRef = this.gridRef(end.x, end.y, 2)
    this.runtime.setField(selection, 'GhosttySelection', 'size', layout.size)
    const startField = this.runtime.field('GhosttySelection', 'start')
    const endField = this.runtime.field('GhosttySelection', 'end')
    this.runtime
      .bytes(selection + startField.offset, startField.size)
      .set(this.runtime.bytes(startRef, startField.size))
    this.runtime
      .bytes(selection + endField.offset, endField.size)
      .set(this.runtime.bytes(endRef, endField.size))
    this.runtime.call('ghostty_terminal_set', this.terminal, 21, selection)
    this.runtime.free(startRef, gridRefSize)
    this.runtime.free(endRef, gridRefSize)
    this.runtime.free(selection, layout.size)
  }

  selectWord(point: Point) {
    return this.selectAt(
      'GhosttyTerminalSelectWordOptions',
      'ghostty_terminal_select_word',
      point
    )
  }

  selectLine(point: Point) {
    return this.selectAt(
      'GhosttyTerminalSelectLineOptions',
      'ghostty_terminal_select_line',
      point
    )
  }

  clearSelection() {
    this.runtime.call('ghostty_terminal_set', this.terminal, 21, 0)
  }

  selectionText() {
    const options = this.runtime.alloc(SELECTION_FORMAT_OPTIONS_SIZE)
    const view = this.runtime.view(options, SELECTION_FORMAT_OPTIONS_SIZE)
    view.setUint32(0, SELECTION_FORMAT_OPTIONS_SIZE, true)
    view.setUint8(8, 1)
    view.setUint8(9, 1)
    const text = this.encodeOutput((output, size, written) =>
      this.runtime.call(
        'ghostty_terminal_selection_format_buf',
        this.terminal,
        options,
        output,
        size,
        written
      )
    )
    this.runtime.free(options, SELECTION_FORMAT_OPTIONS_SIZE)
    return text
  }

  hyperlinkAt(x: number, y: number) {
    const ref = this.gridRef(x, y, 1)
    const link = this.hyperlinkOf(ref)
    this.runtime.free(ref, this.runtime.layout('GhosttyGridRef').size)
    return link
  }

  toScreen(point: Point) {
    return this.convertPoint(point, 1, 2)
  }

  trackCursor() {
    const slot = this.runtime.allocOpaque()
    const result = this.runtime.call(
      'ghostty_terminal_grid_ref_track',
      this.terminal,
      this.cursorPoint(),
      slot
    )
    const ref = this.runtime.readPointer(slot)
    this.runtime.freeOpaque(slot)
    this.check('ghostty_terminal_grid_ref_track', result)
    return ref
  }

  retrack(ref: number) {
    const result = this.runtime.call(
      'ghostty_tracked_grid_ref_set',
      ref,
      this.terminal,
      this.cursorPoint()
    )
    this.check('ghostty_tracked_grid_ref_set', result)
  }

  wrapsToNext(y: number) {
    const ref = this.gridRef(0, y, 2)
    this.runtime.call('ghostty_grid_ref_row', ref, this.scratch)
    const row = this.runtime.view(this.scratch, 8).getBigUint64(0, true)
    this.runtime.bytes(this.scratch + 8, 1)[0] = 0
    this.runtime.call('ghostty_row_get', row, 1, this.scratch + 8)
    this.runtime.free(ref, this.runtime.layout('GhosttyGridRef').size)
    return this.runtime.bytes(this.scratch + 8, 1)[0] !== 0
  }

  trackedPoint(ref: number) {
    const result = this.runtime.call(
      'ghostty_tracked_grid_ref_point',
      ref,
      2,
      this.scratch
    )
    if (result !== SUCCESS) return null
    return {
      x: this.runtime.readField(this.scratch, 'GhosttyPointCoordinate', 'x'),
      y: this.runtime.readField(this.scratch, 'GhosttyPointCoordinate', 'y'),
    }
  }

  trackedHyperlink(ref: number) {
    const size = this.runtime.layout('GhosttyGridRef').size
    const gridRef = this.runtime.alloc(size)
    this.runtime.setField(gridRef, 'GhosttyGridRef', 'size', size)
    const result = this.runtime.call(
      'ghostty_tracked_grid_ref_snapshot',
      ref,
      gridRef
    )
    const link = result === SUCCESS ? this.hyperlinkOf(gridRef) : null
    this.runtime.free(gridRef, size)
    return link
  }

  untrack(ref: number) {
    this.runtime.call('ghostty_tracked_grid_ref_free', ref)
  }

  snapshot(): Snapshot {
    const runtime = this.runtime
    this.check(
      'ghostty_render_state_update',
      runtime.call(
        'ghostty_render_state_update',
        this.renderState,
        this.terminal
      )
    )
    const cols = this.getRender(RENDER_DATA.cols, 2)
    const rowCount = this.getRender(RENDER_DATA.rows, 2)
    const dirty = this.getRender(RENDER_DATA.dirty, 4)
    const foreground = this.getColor(RENDER_DATA.foreground, {
      r: 229,
      g: 231,
      b: 235,
    })
    const background = this.getColor(RENDER_DATA.background, {
      r: 0,
      g: 0,
      b: 0,
    })
    const cursor =
      this.getRender(RENDER_DATA.cursorHasValue, 1) !== 0
        ? this.getColor(RENDER_DATA.cursor, foreground)
        : foreground
    const cursorInViewport =
      this.getRender(RENDER_DATA.cursorInViewport, 1) !== 0
    const cursorVisible =
      this.getRender(RENDER_DATA.cursorVisible, 1) !== 0 && cursorInViewport

    if (
      this.rows.length !== rowCount ||
      this.rows.some((row) => row.cells.length !== cols)
    ) {
      this.rows = Array.from({ length: rowCount }, () => ({
        cells: Array.from({ length: cols }, () =>
          this.emptyCell(foreground, background)
        ),
        isWrapContinuation: false,
        wrapsToNext: false,
      }))
    }

    const dirtyRows = new Set<number>()
    if (dirty !== 0) {
      this.palette = this.readPalette()
      this.check(
        'ghostty_render_state_get',
        runtime.call(
          'ghostty_render_state_get',
          this.renderState,
          RENDER_DATA.rowIterator,
          this.rowIteratorSlot
        )
      )
      const iterator = runtime.readPointer(this.rowIteratorSlot)
      let rowIndex = 0
      while (
        rowIndex < rowCount &&
        runtime.call('ghostty_render_state_row_iterator_next', iterator) !== 0
      ) {
        if (dirty === 2 || this.getRowFlag(iterator, ROW_DATA.dirty)) {
          this.rows[rowIndex] = this.readRow(
            iterator,
            cols,
            foreground,
            background
          )
          dirtyRows.add(rowIndex)
          runtime.bytes(this.scratch, 1)[0] = 0
          runtime.call(
            'ghostty_render_state_row_set',
            iterator,
            0,
            this.scratch
          )
        }
        rowIndex += 1
      }
      runtime.view(this.scratch, 4).setUint32(0, 0, true)
      runtime.call(
        'ghostty_render_state_set',
        this.renderState,
        0,
        this.scratch
      )
    }

    return {
      cols,
      rows: rowCount,
      foreground,
      background,
      cursor,
      cursorX: cursorInViewport ? this.getRender(RENDER_DATA.cursorX, 2) : -1,
      cursorY: cursorInViewport ? this.getRender(RENDER_DATA.cursorY, 2) : -1,
      cursorVisible,
      cursorBlinking: this.getRender(RENDER_DATA.cursorBlinking, 1) !== 0,
      cursorStyle: this.getRender(RENDER_DATA.cursorStyle, 4),
      dirtyRows,
      rowData: this.rows,
    }
  }

  invalidate() {
    this.rows = []
  }

  cellSize() {
    return {
      width: this.sizeReport.cellWidth,
      height: this.sizeReport.cellHeight,
    }
  }

  kittyPlacements() {
    const runtime = this.runtime
    this.check(
      'ghostty_terminal_get',
      runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        KITTY_GRAPHICS,
        this.scratch
      )
    )
    const graphics = runtime.readPointer(this.scratch)
    this.check(
      'ghostty_kitty_graphics_get',
      runtime.call(
        'ghostty_kitty_graphics_get',
        graphics,
        KITTY_PLACEMENTS,
        this.kittyIteratorSlot
      )
    )
    const iterator = runtime.readPointer(this.kittyIteratorSlot)
    const placements: KittyPlacement[] = []
    while (runtime.call('ghostty_kitty_graphics_placement_next', iterator)) {
      if (this.placementData(iterator, KITTY_PLACEMENT.isVirtual).getUint8(0))
        continue
      const imageId = this.placementData(
        iterator,
        KITTY_PLACEMENT.imageId
      ).getUint32(0, true)
      const image = runtime.call(
        'ghostty_kitty_graphics_image',
        graphics,
        imageId
      )
      if (image === 0)
        throw new Error(`kitty placement points to missing image ${imageId}`)
      runtime.bytes(this.kittyInfo, KITTY_RENDER_INFO.size).fill(0)
      const info = runtime.view(this.kittyInfo, KITTY_RENDER_INFO.size)
      info.setUint32(0, KITTY_RENDER_INFO.size, true)
      this.check(
        'ghostty_kitty_graphics_placement_render_info',
        runtime.call(
          'ghostty_kitty_graphics_placement_render_info',
          iterator,
          image,
          this.terminal,
          this.kittyInfo
        )
      )
      if (info.getUint8(KITTY_RENDER_INFO.visible) === 0) continue
      const pointer = this.imageData(image, KITTY_IMAGE.data)
      const length = this.imageData(image, KITTY_IMAGE.length)
      placements.push({
        key: `${imageId}:${pointer}:${length}`,
        z: this.placementData(iterator, KITTY_PLACEMENT.z).getInt32(0, true),
        column: info.getInt32(KITTY_RENDER_INFO.column, true),
        row: info.getInt32(KITTY_RENDER_INFO.row, true),
        xOffset: this.placementData(
          iterator,
          KITTY_PLACEMENT.xOffset
        ).getUint32(0, true),
        yOffset: this.placementData(
          iterator,
          KITTY_PLACEMENT.yOffset
        ).getUint32(0, true),
        width: info.getUint32(KITTY_RENDER_INFO.pixelWidth, true),
        height: info.getUint32(KITTY_RENDER_INFO.pixelHeight, true),
        source: {
          x: info.getUint32(KITTY_RENDER_INFO.sourceX, true),
          y: info.getUint32(KITTY_RENDER_INFO.sourceY, true),
          width: info.getUint32(KITTY_RENDER_INFO.sourceWidth, true),
          height: info.getUint32(KITTY_RENDER_INFO.sourceHeight, true),
        },
        image: {
          width: this.imageData(image, KITTY_IMAGE.width),
          height: this.imageData(image, KITTY_IMAGE.height),
          format: this.imageData(image, KITTY_IMAGE.format),
          pixels: runtime.bytes(pointer, length),
        },
      })
    }
    return placements
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const runtime = this.runtime
    runtime.call('ghostty_formatter_free', this.formatter)
    runtime.call('ghostty_mouse_event_free', this.mouseEvent)
    runtime.call('ghostty_mouse_encoder_free', this.mouseEncoder)
    runtime.call('ghostty_key_event_free', this.keyEvent)
    runtime.call('ghostty_key_encoder_free', this.keyEncoder)
    const cells = runtime.readPointer(this.rowCellsSlot)
    if (cells) runtime.call('ghostty_render_state_row_cells_free', cells)
    const iterator = runtime.readPointer(this.rowIteratorSlot)
    if (iterator)
      runtime.call('ghostty_render_state_row_iterator_free', iterator)
    runtime.call('ghostty_render_state_free', this.renderState)
    if (this.hostId !== 0) runtime.detachHost(this.terminal, this.hostId)
    runtime.call('ghostty_terminal_free', this.terminal)
    runtime.free(this.style, runtime.layout('GhosttyStyle').size)
    runtime.free(this.cellQuery, CELL_QUERY.size)
    runtime.free(
      this.scrollbar,
      runtime.layout('GhosttyTerminalScrollbar').size
    )
    runtime.free(this.scratch, 16)
    runtime.call(
      'ghostty_kitty_graphics_placement_iterator_free',
      runtime.readPointer(this.kittyIteratorSlot)
    )
    runtime.free(this.kittyInfo, KITTY_RENDER_INFO.size)
    runtime.free(this.point, runtime.layout('GhosttyPoint').size)
    runtime.free(this.graphemes, this.graphemeCapacity)
    for (const slot of [
      this.formatterSlot,
      this.mouseEventSlot,
      this.mouseEncoderSlot,
      this.keyEventSlot,
      this.keyEncoderSlot,
      this.rowCellsSlot,
      this.rowIteratorSlot,
      this.renderStateSlot,
      this.terminalSlot,
      this.kittyIteratorSlot,
    ])
      runtime.freeOpaque(slot)
  }

  private noteKittyCommand(data: Uint8Array) {
    const edge = [...this.tail, ...data.subarray(0, 2)]
    let found = edge.some(
      (byte, index) =>
        byte === 0x1b && edge[index + 1] === 0x5f && edge[index + 2] === 0x47
    )
    let index = data.indexOf(0x1b)
    while (!found && index !== -1) {
      found = data[index + 1] === 0x5f && data[index + 2] === 0x47
      index = data.indexOf(0x1b, index + 1)
    }
    if (found) this.kittyCommands += 1
    this.tail = [...this.tail, ...data.subarray(-2)].slice(-2)
  }

  private placementData(iterator: number, key: number) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.check(
      'ghostty_kitty_graphics_placement_get',
      this.runtime.call(
        'ghostty_kitty_graphics_placement_get',
        iterator,
        key,
        this.scratch
      )
    )
    return this.runtime.view(this.scratch, 4)
  }

  private imageData(image: number, key: number) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.check(
      'ghostty_kitty_graphics_image_get',
      this.runtime.call(
        'ghostty_kitty_graphics_image_get',
        image,
        key,
        this.scratch
      )
    )
    return this.runtime.view(this.scratch, 4).getUint32(0, true)
  }

  private encodeOutput(
    encode: (output: number, size: number, written: number) => number
  ) {
    const written = this.runtime.call('ghostty_wasm_alloc_usize')
    let encoded = ''
    const sizeResult = encode(0, 0, written)
    const size = this.runtime.view(written, 4).getUint32(0, true)
    if (sizeResult === OUT_OF_SPACE && size > 0) {
      const output = this.runtime.alloc(size)
      const result = encode(output, size, written)
      const length = this.runtime.view(written, 4).getUint32(0, true)
      if (result === SUCCESS)
        encoded = decoder.decode(this.runtime.bytes(output, length))
      this.runtime.free(output, size)
    }
    this.runtime.call('ghostty_wasm_free_usize', written)
    return encoded
  }

  private hyperlinkOf(gridRef: number) {
    const link = this.encodeOutput((output, size, written) =>
      this.runtime.call(
        'ghostty_grid_ref_hyperlink_uri',
        gridRef,
        output,
        size,
        written
      )
    )
    return link === '' ? null : link
  }

  private readPalette() {
    const pointer = this.runtime.alloc(768)
    this.runtime.call('ghostty_terminal_get', this.terminal, 21, pointer)
    const bytes = this.runtime.bytes(pointer, 768)
    const palette = Array.from({ length: 256 }, (_, index) => ({
      r: bytes[index * 3],
      g: bytes[index * 3 + 1],
      b: bytes[index * 3 + 2],
    }))
    this.runtime.free(pointer, 768)
    return palette
  }

  private readRow(
    iterator: number,
    cols: number,
    defaultForeground: Color,
    defaultBackground: Color
  ): Row {
    const runtime = this.runtime
    this.check(
      'ghostty_render_state_row_get',
      runtime.call(
        'ghostty_render_state_row_get',
        iterator,
        ROW_DATA.raw,
        this.scratch
      )
    )
    const rawRow = runtime.view(this.scratch, 8).getBigUint64(0, true)
    runtime.bytes(this.scratch + 8, 1)[0] = 0
    runtime.call('ghostty_row_get', rawRow, 2, this.scratch + 8)
    const isWrapContinuation = runtime.bytes(this.scratch + 8, 1)[0] !== 0
    runtime.bytes(this.scratch + 8, 1)[0] = 0
    runtime.call('ghostty_row_get', rawRow, 1, this.scratch + 8)
    const wrapsToNext = runtime.bytes(this.scratch + 8, 1)[0] !== 0

    this.check(
      'ghostty_render_state_row_get',
      runtime.call(
        'ghostty_render_state_row_get',
        iterator,
        ROW_DATA.cells,
        this.rowCellsSlot
      )
    )
    const cellsIterator = runtime.readPointer(this.rowCellsSlot)
    const { size: styleSize, fields: styleFields } =
      runtime.layout('GhosttyStyle')
    const cells: Cell[] = []
    while (
      cells.length < cols &&
      runtime.call('ghostty_render_state_row_cells_next', cellsIterator) !== 0
    ) {
      runtime.bytes(this.style, styleSize).fill(0)
      runtime.setField(this.style, 'GhosttyStyle', 'size', styleSize)
      const result = runtime.call(
        'ghostty_render_state_row_cells_get_multi',
        cellsIterator,
        5,
        this.cellQuery + CELL_QUERY.keys,
        this.cellQuery + CELL_QUERY.values,
        this.cellQuery + CELL_QUERY.written
      )
      const queryView = runtime.dataView()
      const written = queryView.getUint32(
        this.cellQuery + CELL_QUERY.written,
        true
      )
      if (written < 3)
        this.check('ghostty_render_state_row_cells_get_multi', result)
      const graphemeLength = queryView.getUint32(
        this.cellQuery + CELL_QUERY.graphemesLength,
        true
      )
      const selected =
        queryView.getUint8(this.cellQuery + CELL_QUERY.selected) !== 0
      let background =
        written >= 4
          ? this.readColor(this.cellQuery + CELL_QUERY.background)
          : defaultBackground
      let foreground =
        written === 5
          ? this.readColor(this.cellQuery + CELL_QUERY.foreground)
          : written === 3
            ? this.getCellColor(cellsIterator, defaultForeground)
            : defaultForeground
      let text = ''
      if (graphemeLength > 0) {
        const bufferSize = graphemeLength * 4
        if (bufferSize > this.graphemeCapacity) {
          const capacity = Math.max(bufferSize, this.graphemeCapacity * 2)
          const buffer = runtime.alloc(capacity)
          runtime.free(this.graphemes, this.graphemeCapacity)
          this.graphemes = buffer
          this.graphemeCapacity = capacity
        }
        if (
          runtime.call(
            'ghostty_render_state_row_cells_get',
            cellsIterator,
            CELL_DATA.graphemes,
            this.graphemes
          ) === SUCCESS
        )
          text = cellText(
            runtime.view(this.graphemes, bufferSize),
            graphemeLength
          )
      }
      let wide = 0
      if (text.length === 0 && cells.at(-1)?.text.length) {
        runtime.call(
          'ghostty_render_state_row_cells_get',
          cellsIterator,
          CELL_DATA.raw,
          this.scratch
        )
        const rawCell = runtime.view(this.scratch, 8).getBigUint64(0, true)
        runtime.view(this.scratch + 8, 4).setUint32(0, 0, true)
        runtime.call('ghostty_cell_get', rawCell, 3, this.scratch + 8)
        wide = runtime.view(this.scratch + 8, 4).getUint32(0, true)
      }
      const styleView = runtime.dataView()
      const flag = (name: string) =>
        styleView.getUint8(this.style + styleFields[name].offset) !== 0
      const bold = flag('bold')
      if (
        this.boldIsBright &&
        bold &&
        styleView.getUint32(this.style + STYLE_FOREGROUND_TAG, true) ===
          STYLE_COLOR_PALETTE
      ) {
        const index = styleView.getUint8(this.style + STYLE_FOREGROUND_INDEX)
        if (index < 8) foreground = this.palette[index + 8] ?? foreground
      }
      if (flag('inverse')) [foreground, background] = [background, foreground]
      if (flag('faint')) foreground = blend(foreground, background)
      const underlineColor = this.style + styleFields.underline_color.offset
      const underlineTag = styleView.getUint32(underlineColor, true)
      const underlineValue = underlineColor + STYLE_COLOR_VALUE
      cells.push({
        text,
        wide,
        foreground,
        background,
        bold,
        italic: flag('italic'),
        invisible: flag('invisible'),
        strikethrough: flag('strikethrough'),
        overline: flag('overline'),
        underline: styleView.getInt32(
          this.style + styleFields.underline.offset,
          true
        ),
        underlineColor:
          underlineTag === STYLE_COLOR_PALETTE
            ? this.palette[styleView.getUint8(underlineValue)]
            : underlineTag === STYLE_COLOR_RGB
              ? this.readColor(underlineValue)
              : null,
        selected,
      })
    }
    while (cells.length < cols)
      cells.push(this.emptyCell(defaultForeground, defaultBackground))
    return { cells, isWrapContinuation, wrapsToNext }
  }

  cursorPosition() {
    this.runtime.dataView().setUint32(this.scratch, 0, true)
    this.runtime.call('ghostty_terminal_get', this.terminal, 3, this.scratch)
    this.runtime.call(
      'ghostty_terminal_get',
      this.terminal,
      4,
      this.scratch + 2
    )
    const view = this.runtime.dataView()
    return {
      x: view.getUint16(this.scratch, true),
      y: view.getUint16(this.scratch + 2, true),
    }
  }

  private cursorPoint() {
    const cursor = this.cursorPosition()
    this.fillPoint(this.point, cursor.x, cursor.y, 0)
    return this.point
  }

  private pointer(x: number, y: number, tag: 0 | 1 | 2) {
    const point = this.runtime.alloc(this.runtime.layout('GhosttyPoint').size)
    this.fillPoint(point, x, y, tag)
    return point
  }

  private fillPoint(point: number, x: number, y: number, tag: 0 | 1 | 2) {
    this.runtime.setField(point, 'GhosttyPoint', 'tag', tag)
    const value = this.runtime.field('GhosttyPoint', 'value')
    const view = this.runtime.dataView()
    view.setUint16(point + value.offset, Math.max(0, x), true)
    view.setUint32(point + value.offset + 4, Math.max(0, y), true)
  }

  private gridRef(x: number, y: number, tag: 1 | 2) {
    const point = this.pointer(x, y, tag)
    const size = this.runtime.layout('GhosttyGridRef').size
    const gridRef = this.runtime.alloc(size)
    this.runtime.setField(gridRef, 'GhosttyGridRef', 'size', size)
    const result = this.runtime.call(
      'ghostty_terminal_grid_ref',
      this.terminal,
      point,
      gridRef
    )
    this.runtime.free(point, this.runtime.layout('GhosttyPoint').size)
    if (result !== SUCCESS) {
      this.runtime.free(gridRef, size)
      this.check('ghostty_terminal_grid_ref', result)
    }
    return gridRef
  }

  private selectAt(
    optionsName:
      | 'GhosttyTerminalSelectWordOptions'
      | 'GhosttyTerminalSelectLineOptions',
    operation: 'ghostty_terminal_select_word' | 'ghostty_terminal_select_line',
    point: Point
  ) {
    const optionsLayout = this.runtime.layout(optionsName)
    const selectionLayout = this.runtime.layout('GhosttySelection')
    const options = this.runtime.alloc(optionsLayout.size)
    const selection = this.runtime.alloc(selectionLayout.size)
    const ref = this.gridRef(point.x, point.y, 2)
    this.runtime.setField(options, optionsName, 'size', optionsLayout.size)
    const refField = this.runtime.field(optionsName, 'ref')
    this.runtime
      .bytes(options + refField.offset, refField.size)
      .set(this.runtime.bytes(ref, refField.size))
    this.runtime.setField(
      selection,
      'GhosttySelection',
      'size',
      selectionLayout.size
    )
    let range: { start: Point; end: Point } | null = null
    if (
      this.runtime.call(operation, this.terminal, options, selection) ===
      SUCCESS
    ) {
      const start = this.pointFromGridRef(
        selection + this.runtime.field('GhosttySelection', 'start').offset,
        2
      )
      const end = this.pointFromGridRef(
        selection + this.runtime.field('GhosttySelection', 'end').offset,
        2
      )
      if (start && end) range = { start, end }
    }
    this.runtime.free(selection, selectionLayout.size)
    this.runtime.free(ref, this.runtime.layout('GhosttyGridRef').size)
    this.runtime.free(options, optionsLayout.size)
    return range
  }

  private convertPoint(point: Point, from: 1 | 2, to: 1 | 2) {
    const ref = this.gridRef(point.x, point.y, from)
    const converted = this.pointFromGridRef(ref, to)
    this.runtime.free(ref, this.runtime.layout('GhosttyGridRef').size)
    return converted
  }

  private pointFromGridRef(ref: number, tag: 1 | 2) {
    const layout = this.runtime.layout('GhosttyPointCoordinate')
    const coordinate = this.runtime.alloc(layout.size)
    const result = this.runtime.call(
      'ghostty_terminal_point_from_grid_ref',
      this.terminal,
      ref,
      tag,
      coordinate
    )
    const point =
      result === SUCCESS
        ? {
            x: this.runtime.readField(
              coordinate,
              'GhosttyPointCoordinate',
              'x'
            ),
            y: this.runtime.readField(
              coordinate,
              'GhosttyPointCoordinate',
              'y'
            ),
          }
        : null
    this.runtime.free(coordinate, layout.size)
    return point
  }

  private getFlag(
    operation: 'ghostty_terminal_get' | 'ghostty_terminal_mode_get',
    key: number
  ) {
    this.runtime.bytes(this.scratch, 1)[0] = 0
    return (
      this.runtime.call(operation, this.terminal, key, this.scratch) ===
        SUCCESS && this.runtime.bytes(this.scratch, 1)[0] !== 0
    )
  }

  private getRender(data: number, size: 1 | 2 | 4) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.check(
      'ghostty_render_state_get',
      this.runtime.call(
        'ghostty_render_state_get',
        this.renderState,
        data,
        this.scratch
      )
    )
    const view = this.runtime.view(this.scratch, 4)
    if (size === 1) return view.getUint8(0)
    if (size === 2) return view.getUint16(0, true)
    return view.getUint32(0, true)
  }

  private getColor(data: number, fallback: Color) {
    this.runtime.bytes(this.scratch, 3).fill(0)
    const result = this.runtime.call(
      'ghostty_render_state_get',
      this.renderState,
      data,
      this.scratch
    )
    return result === SUCCESS ? this.readColor(this.scratch) : fallback
  }

  private terminalColor(data: number) {
    this.runtime.bytes(this.scratch, 3).fill(0)
    this.check(
      'ghostty_terminal_get',
      this.runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        data,
        this.scratch
      )
    )
    return this.readColor(this.scratch)
  }

  private getRowFlag(iterator: number, data: number) {
    this.runtime.bytes(this.scratch, 1)[0] = 0
    return (
      this.runtime.call(
        'ghostty_render_state_row_get',
        iterator,
        data,
        this.scratch
      ) === SUCCESS && this.runtime.bytes(this.scratch, 1)[0] !== 0
    )
  }

  private getCellColor(iterator: number, fallback: Color) {
    this.runtime.bytes(this.scratch, 3).fill(0)
    const result = this.runtime.call(
      'ghostty_render_state_row_cells_get',
      iterator,
      CELL_DATA.foreground,
      this.scratch
    )
    return result === SUCCESS ? this.readColor(this.scratch) : fallback
  }

  private readColor(pointer: number): Color {
    const view = this.runtime.dataView()
    return {
      r: view.getUint8(pointer),
      g: view.getUint8(pointer + 1),
      b: view.getUint8(pointer + 2),
    }
  }

  private emptyCell(foreground: Color, background: Color): Cell {
    return {
      text: '',
      wide: 0,
      foreground,
      background,
      bold: false,
      italic: false,
      invisible: false,
      strikethrough: false,
      overline: false,
      underline: 0,
      underlineColor: null,
      selected: false,
    }
  }

  private check(operation: string, result: number) {
    if (result !== SUCCESS)
      throw new Error(`${operation} failed with result ${result}`)
  }
}
