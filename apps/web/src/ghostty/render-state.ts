import { PLACEHOLDER, type Placeholder, readPlaceholder } from './kitty'
import { type GhosttyRuntime, ghostty, SUCCESS } from './runtime'

const STYLE_FOREGROUND_TAG = 8
const STYLE_FOREGROUND_INDEX = 16
const STYLE_COLOR_NONE = 0
const STYLE_COLOR_PALETTE = 1
const STYLE_COLOR_RGB = 2
const STYLE_COLOR_VALUE = 8

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
  placeholder: Placeholder | null
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

function emptyCell(foreground: Color, background: Color): Cell {
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
    placeholder: null,
  }
}

export function readColor(runtime: GhosttyRuntime, pointer: number): Color {
  const view = runtime.dataView()
  return {
    r: view.getUint8(pointer),
    g: view.getUint8(pointer + 1),
    b: view.getUint8(pointer + 2),
  }
}

export function readPalette(runtime: GhosttyRuntime, terminal: number) {
  const pointer = runtime.alloc(768)
  runtime.call('ghostty_terminal_get', terminal, 21, pointer)
  const bytes = runtime.bytes(pointer, 768)
  const palette = Array.from({ length: 256 }, (_, index) => ({
    r: bytes[index * 3],
    g: bytes[index * 3 + 1],
    b: bytes[index * 3 + 2],
  }))
  runtime.free(pointer, 768)
  return palette
}

export function rowCharacters(row: Row, y: number) {
  const text: string[] = []
  const points: { x: number; y: number }[] = []
  row.cells.forEach((cell, x) => {
    if (cell.wide === 2) return
    for (const unit of (cell.text || ' ').split('')) {
      text.push(unit)
      points.push({ x, y })
    }
  })
  return { text: text.join(''), points }
}

export class RenderState {
  private readonly runtime = ghostty()
  private readonly stateSlot: number
  private readonly state: number
  private readonly rowIteratorSlot: number
  private readonly rowCellsSlot: number
  private readonly scratch: number
  private readonly style: number
  private readonly cellQuery: number
  private graphemes = 0
  private graphemeCapacity = 0
  private rows: Row[] = []
  private palette: Color[] = []

  constructor() {
    const runtime = this.runtime
    this.stateSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_render_state_new',
      runtime.call('ghostty_render_state_new', 0, this.stateSlot)
    )
    this.state = runtime.readPointer(this.stateSlot)
    this.rowIteratorSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_render_state_row_iterator_new',
      runtime.call(
        'ghostty_render_state_row_iterator_new',
        0,
        this.rowIteratorSlot
      )
    )
    this.rowCellsSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_render_state_row_cells_new',
      runtime.call('ghostty_render_state_row_cells_new', 0, this.rowCellsSlot)
    )
    this.scratch = runtime.alloc(16)
    this.style = runtime.alloc(runtime.layout('GhosttyStyle').size)
    this.cellQuery = runtime.alloc(CELL_QUERY.size)
    const queryView = runtime.dataView()
    const cellFields = [
      [CELL_DATA.style, this.style],
      [CELL_DATA.graphemesLength, this.cellQuery + CELL_QUERY.graphemesLength],
      [CELL_DATA.selected, this.cellQuery + CELL_QUERY.selected],
      [CELL_DATA.background, this.cellQuery + CELL_QUERY.background],
      [CELL_DATA.foreground, this.cellQuery + CELL_QUERY.foreground],
    ] as const
    cellFields.forEach((field, index) => {
      queryView.setUint32(
        this.cellQuery + CELL_QUERY.keys + index * 4,
        field[0],
        true
      )
      queryView.setUint32(
        this.cellQuery + CELL_QUERY.values + index * 4,
        field[1],
        true
      )
    })
  }

  snapshot(terminal: number, boldIsBright: boolean): Snapshot {
    const runtime = this.runtime
    runtime.check(
      'ghostty_render_state_update',
      runtime.call('ghostty_render_state_update', this.state, terminal)
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
          emptyCell(foreground, background)
        ),
        isWrapContinuation: false,
        wrapsToNext: false,
      }))
    }

    const dirtyRows = new Set<number>()
    if (dirty !== 0) {
      this.palette = readPalette(runtime, terminal)
      runtime.check(
        'ghostty_render_state_get',
        runtime.call(
          'ghostty_render_state_get',
          this.state,
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
            background,
            boldIsBright
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
      runtime.call('ghostty_render_state_set', this.state, 0, this.scratch)
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

  dispose() {
    const runtime = this.runtime
    const cells = runtime.readPointer(this.rowCellsSlot)
    if (cells) runtime.call('ghostty_render_state_row_cells_free', cells)
    const iterator = runtime.readPointer(this.rowIteratorSlot)
    if (iterator)
      runtime.call('ghostty_render_state_row_iterator_free', iterator)
    runtime.call('ghostty_render_state_free', this.state)
    runtime.free(this.style, runtime.layout('GhosttyStyle').size)
    runtime.free(this.cellQuery, CELL_QUERY.size)
    runtime.free(this.scratch, 16)
    runtime.free(this.graphemes, this.graphemeCapacity)
    runtime.freeOpaque(this.rowCellsSlot)
    runtime.freeOpaque(this.rowIteratorSlot)
    runtime.freeOpaque(this.stateSlot)
  }

  private readRow(
    iterator: number,
    cols: number,
    defaultForeground: Color,
    defaultBackground: Color,
    boldIsBright: boolean
  ): Row {
    const runtime = this.runtime
    runtime.check(
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

    runtime.check(
      'ghostty_render_state_row_get',
      runtime.call(
        'ghostty_render_state_row_get',
        iterator,
        ROW_DATA.cells,
        this.rowCellsSlot
      )
    )
    const cellsIterator = runtime.readPointer(this.rowCellsSlot)
    const styleLayout = runtime.layout('GhosttyStyle')
    const styleSize = styleLayout.size
    const styleFields = styleLayout.fields
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
        runtime.check('ghostty_render_state_row_cells_get_multi', result)
      const graphemeLength = queryView.getUint32(
        this.cellQuery + CELL_QUERY.graphemesLength,
        true
      )
      const selected =
        queryView.getUint8(this.cellQuery + CELL_QUERY.selected) !== 0
      let background =
        written >= 4
          ? readColor(runtime, this.cellQuery + CELL_QUERY.background)
          : defaultBackground
      let foreground =
        written === 5
          ? readColor(runtime, this.cellQuery + CELL_QUERY.foreground)
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
        boldIsBright &&
        bold &&
        styleView.getUint32(this.style + STYLE_FOREGROUND_TAG, true) ===
          STYLE_COLOR_PALETTE
      ) {
        const index = styleView.getUint8(this.style + STYLE_FOREGROUND_INDEX)
        if (index < 8) foreground = this.palette[index + 8] ?? foreground
      }
      if (flag('inverse')) {
        const swapped = foreground
        foreground = background
        background = swapped
      }
      if (flag('faint')) foreground = blend(foreground, background)
      const underlineColor = this.style + styleFields.underline_color.offset
      const underlineTag = styleView.getUint32(underlineColor, true)
      const underlineValue = underlineColor + STYLE_COLOR_VALUE
      let placeholder: Placeholder | null = null
      if (text.codePointAt(0) === PLACEHOLDER) {
        placeholder = readPlaceholder(
          text,
          this.colorId(this.style + STYLE_FOREGROUND_TAG),
          this.colorId(underlineColor)
        )
        text = ''
      }
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
              ? readColor(runtime, underlineValue)
              : null,
        selected,
        placeholder,
      })
    }
    while (cells.length < cols)
      cells.push(emptyCell(defaultForeground, defaultBackground))
    return { cells, isWrapContinuation, wrapsToNext }
  }

  private getRender(data: number, size: 1 | 2 | 4) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.runtime.check(
      'ghostty_render_state_get',
      this.runtime.call(
        'ghostty_render_state_get',
        this.state,
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
      this.state,
      data,
      this.scratch
    )
    return result === SUCCESS ? readColor(this.runtime, this.scratch) : fallback
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
    return result === SUCCESS ? readColor(this.runtime, this.scratch) : fallback
  }

  private colorId(pointer: number) {
    const view = this.runtime.dataView()
    const tag = view.getUint32(pointer, true)
    if (tag === STYLE_COLOR_NONE) return 0
    if (tag === STYLE_COLOR_PALETTE)
      return view.getUint8(pointer + STYLE_COLOR_VALUE)
    if (tag === STYLE_COLOR_RGB) {
      const color = readColor(this.runtime, pointer + STYLE_COLOR_VALUE)
      return (color.r << 16) | (color.g << 8) | color.b
    }
    throw new Error(`unknown style color tag ${tag}`)
  }
}
