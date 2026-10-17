import { InputEncoder } from './keys'
import { hasKittyGraphics, KittyGraphics } from './kitty'
import {
  type Color,
  readColor,
  readPalette,
  RenderState,
  type Snapshot,
} from './render-state'
import { ghostty, type SizeReport, SUCCESS, type TerminalHost } from './runtime'

const SELECTION_FORMAT_OPTIONS_SIZE = 16
const PAGE_BYTES = 589_824
const PAGE_GRID_BYTES = 381_888
const SCROLLBACK_MAX_BYTES = 50_000_000

export type Colors = {
  foreground: Color
  background: Color
  cursor: Color
  palette: Color[]
}

export type CursorStyle = 'block' | 'bar' | 'underline'

export type Point = { x: number; y: number }

export type Scrollbar = { total: number; offset: number; len: number }

const decoder = new TextDecoder()

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
  readonly encoder: InputEncoder
  readonly kitty: KittyGraphics
  private readonly runtime = ghostty()
  private readonly terminalSlot: number
  private readonly terminal: number
  private readonly renderState: RenderState
  private readonly formatterSlot: number
  private readonly formatter: number
  private readonly scratch: number
  private readonly point: number
  private readonly scrollbar: number
  private readonly host: TerminalHost
  private hostId = 0
  private sizeReport: SizeReport
  private disposed = false
  boldIsBright = false
  version = ''

  constructor(
    cols: number,
    rows: number,
    scrollback: number,
    onPtyData: (data: string) => void,
    onBell: () => void
  ) {
    const runtime = this.runtime
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
    runtime.check('ghostty_terminal_new', result)
    this.terminal = runtime.readPointer(this.terminalSlot)
    if (!hasKittyGraphics(this.terminal)) {
      runtime.call('ghostty_terminal_free', this.terminal)
      runtime.freeOpaque(this.terminalSlot)
      throw new Error(
        'libghostty-vt was built without kitty graphics, build it with scripts/build-ghostty-wasm.mts'
      )
    }
    this.sizeReport = { rows, columns: cols, cellWidth: 1, cellHeight: 1 }
    this.host = {
      write: onPtyData,
      size: () => this.sizeReport,
      bell: onBell,
      version: () => this.version,
    }
    this.hostId = runtime.attachHost(this.terminal, this.host)
    this.renderState = new RenderState()
    this.encoder = new InputEncoder(this.terminal)
    this.kitty = new KittyGraphics(this.terminal)

    const name = 'GhosttyFormatterTerminalOptions'
    const formatterLayout = runtime.layout(name)
    const formatterOptions = runtime.alloc(formatterLayout.size)
    const extra = runtime.field(name, 'extra')
    const screen = runtime.field('GhosttyFormatterTerminalExtra', 'screen')
    runtime.setField(formatterOptions, name, 'size', formatterLayout.size)
    runtime.setField(formatterOptions, name, 'trim', 1)
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
    runtime.check('ghostty_formatter_terminal_new', formatterResult)
    this.formatter = runtime.readPointer(this.formatterSlot)

    this.scratch = runtime.alloc(16)
    this.point = runtime.alloc(runtime.layout('GhosttyPoint').size)
    this.scrollbar = runtime.alloc(
      runtime.layout('GhosttyTerminalScrollbar').size
    )
  }

  write(data: Uint8Array) {
    if (data.length === 0) return
    this.kitty.note(data)
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
    this.renderState.invalidate()
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
    this.runtime.check(
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
    for (const option of [
      [11, colors.foreground],
      [12, colors.background],
      [13, colors.cursor],
    ] as const) {
      const value = option[1]
      this.runtime.bytes(color, 3).set([value.r, value.g, value.b])
      this.runtime.call('ghostty_terminal_set', this.terminal, option[0], color)
    }
    this.runtime.free(color, 3)
    const palette = fullPalette(colors.palette)
    const pointer = this.runtime.alloc(palette.length * 3)
    this.runtime
      .bytes(pointer, palette.length * 3)
      .set(palette.flatMap((value) => [value.r, value.g, value.b]))
    this.runtime.call('ghostty_terminal_set', this.terminal, 14, pointer)
    this.runtime.free(pointer, palette.length * 3)
    this.renderState.invalidate()
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
    return this.flag('ghostty_terminal_get', 11)
  }

  isMouseAnyEventTracking() {
    return this.flag('ghostty_terminal_mode_get', 1003)
  }

  isFocusReporting() {
    return this.flag('ghostty_terminal_mode_get', 1004)
  }

  isSynchronizedOutput() {
    return this.flag('ghostty_terminal_mode_get', 2026)
  }

  endSynchronizedOutput() {
    this.runtime.check(
      'ghostty_terminal_mode_set',
      this.runtime.call('ghostty_terminal_mode_set', this.terminal, 2026, 0)
    )
  }

  currentColors(): Colors {
    return {
      foreground: this.terminalColor(18),
      background: this.terminalColor(19),
      cursor: this.terminalColor(20),
      palette: readPalette(this.runtime, this.terminal),
    }
  }

  isApplicationCursorKeys() {
    return this.flag('ghostty_terminal_mode_get', 1)
  }

  isKittyKeyboard() {
    return this.flag('ghostty_terminal_get', 8)
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

  setSelection(start: Point, end: Point) {
    const gridRefSize = this.runtime.layout('GhosttyGridRef').size
    const startRef = this.gridRef(start.x, start.y, 2)
    try {
      const endRef = this.gridRef(end.x, end.y, 2)
      const layout = this.runtime.layout('GhosttySelection')
      const selection = this.runtime.alloc(layout.size)
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
      this.runtime.free(endRef, gridRefSize)
      this.runtime.free(selection, layout.size)
    } finally {
      this.runtime.free(startRef, gridRefSize)
    }
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
    const text = this.runtime.encodeOutput((output, size, written) =>
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
    const ref = this.gridRef(point.x, point.y, 1)
    const converted = this.pointFromGridRef(ref, 2)
    this.runtime.free(ref, this.runtime.layout('GhosttyGridRef').size)
    return converted
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
    this.runtime.check('ghostty_terminal_grid_ref_track', result)
    return ref
  }

  retrack(ref: number) {
    const result = this.runtime.call(
      'ghostty_tracked_grid_ref_set',
      ref,
      this.terminal,
      this.cursorPoint()
    )
    this.runtime.check('ghostty_tracked_grid_ref_set', result)
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
    return this.renderState.snapshot(this.terminal, this.boldIsBright)
  }

  invalidate() {
    this.renderState.invalidate()
  }

  cellSize() {
    return {
      width: this.sizeReport.cellWidth,
      height: this.sizeReport.cellHeight,
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    const runtime = this.runtime
    runtime.call('ghostty_formatter_free', this.formatter)
    this.encoder.dispose()
    this.kitty.dispose()
    this.renderState.dispose()
    if (this.hostId !== 0) runtime.detachHost(this.terminal, this.hostId)
    runtime.call('ghostty_terminal_free', this.terminal)
    runtime.free(
      this.scrollbar,
      runtime.layout('GhosttyTerminalScrollbar').size
    )
    runtime.free(this.scratch, 16)
    runtime.free(this.point, runtime.layout('GhosttyPoint').size)
    runtime.freeOpaque(this.formatterSlot)
    runtime.freeOpaque(this.terminalSlot)
  }

  private hyperlinkOf(gridRef: number) {
    const link = this.runtime.encodeOutput((output, size, written) =>
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

  private fillPoint(point: number, x: number, y: number, tag: 0 | 1 | 2) {
    this.runtime.setField(point, 'GhosttyPoint', 'tag', tag)
    const value = this.runtime.field('GhosttyPoint', 'value')
    const view = this.runtime.dataView()
    view.setUint16(point + value.offset, Math.max(0, x), true)
    view.setUint32(point + value.offset + 4, Math.max(0, y), true)
  }

  private gridRef(x: number, y: number, tag: 1 | 2) {
    const point = this.runtime.alloc(this.runtime.layout('GhosttyPoint').size)
    this.fillPoint(point, x, y, tag)
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
      this.runtime.check('ghostty_terminal_grid_ref', result)
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
    const ref = this.gridRef(point.x, point.y, 2)
    const optionsLayout = this.runtime.layout(optionsName)
    const selectionLayout = this.runtime.layout('GhosttySelection')
    const options = this.runtime.alloc(optionsLayout.size)
    const selection = this.runtime.alloc(selectionLayout.size)
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

  private flag(
    operation: 'ghostty_terminal_get' | 'ghostty_terminal_mode_get',
    key: number
  ) {
    return this.runtime.flag(operation, this.terminal, key)
  }

  private terminalColor(data: number) {
    this.runtime.bytes(this.scratch, 3).fill(0)
    this.runtime.check(
      'ghostty_terminal_get',
      this.runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        data,
        this.scratch
      )
    )
    return readColor(this.runtime, this.scratch)
  }
}
