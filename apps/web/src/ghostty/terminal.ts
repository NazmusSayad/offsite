import {
  CELL_WIDE,
  type Color,
  type CursorStyle,
  GhosttyCore,
  type KittyPlacement,
  type Point,
  type Row,
  type Scrollbar,
  type Snapshot,
} from './core'
import { decodeInlineImage, decodeSixel, kittyBitmap } from './images'
import { OutputScanner, type OutputEvent } from './output'
import {
  type Appearance,
  type Highlight,
  type ImageLayer,
  type Metrics,
  measureCell,
  type Range,
  render,
} from './renderer'

export type TerminalColors = {
  background: string
  foreground: string
  cursor: string
  cursorText: string
  selectionBackground: string
  selectionForeground: string
  palette: string[]
}

export type TerminalOptions = {
  fontFamily: string
  fontSize: number
  lineHeight: number
  ligatures: boolean
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  boldIsBright: boolean
  colors: TerminalColors
  version: string
  clickToMoveCursor: boolean
  optionAsMeta: OptionAsMeta
}

export type OptionAsMeta = 'off' | 'left' | 'right' | 'both'

export type TerminalHandlers = {
  onData: (data: string) => void
  onReply: (data: string) => void
  onResize: (cols: number, rows: number) => void
  onTitle: (title: string) => void
  onProgress: (progress: Progress) => void
  onBell: () => void
  onNotify: (title: string, body: string) => void
  onClipboard: (text: string) => void
  onClipboardRead: (query: ClipboardQuery) => void
  onLink: (uri: string, event: MouseEvent) => void
  beforeKey: (event: KeyboardEvent) => boolean
}

export type Progress = { state: number; value: number }

export type ClipboardQuery = {
  selection: string
  terminator: string
  generation: number
  epoch: number
  atPrompt: boolean
}

export type FindResults = { resultIndex: number; resultCount: number }

type Link = { uri: string; range: Range }

type Match = { row: number; index: number }

type Image = {
  ref: number
  marker: string
  bitmap: ImageBitmap
  width: number
  height: number
  alternate: boolean
}

type Chunk = { data: Uint8Array; replay: boolean }

const isMac = navigator.userAgent.includes('Mac')
const BLINK_INTERVAL = 600
const SYNC_TIMEOUT = 1000
const MULTI_CLICK_INTERVAL = 500
const IMAGE_LIMIT = 200
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g
const decoder = new TextDecoder()
const latin1 = new TextDecoder('latin1')

function kittyLayer(z: number): ImageLayer {
  if (z < -1_073_741_824) return 'belowBackground'
  if (z < 0) return 'belowText'
  return 'aboveText'
}

function parseColor(value: string): Color {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (!match) throw new Error(`unsupported color ${value}`)
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

function quoteFamilies(list: string) {
  const families = list
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) =>
      /^(['"]).*\1$/.test(name) || /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)
        ? name
        : `"${name.replaceAll('"', '')}"`
    )
  return [...families, 'monospace'].join(', ')
}

function colorSpec(color: Color) {
  function channel(value: number) {
    return value.toString(16).padStart(2, '0').repeat(2)
  }
  return `rgb:${channel(color.r)}/${channel(color.g)}/${channel(color.b)}`
}

function percent(value: number) {
  return Math.min(Math.max(value, 0), 100)
}

function mouseButton(button: number) {
  if (button === 0) return 1
  if (button === 1) return 3
  if (button === 2) return 2
  return null
}

function xtermSelection(value: string) {
  if (value === '') return 's0'
  return [...value].filter((letter) => 'cpqs01234567'.includes(letter)).join('')
}

function isBefore(point: Point, other: Point) {
  return point.y < other.y || (point.y === other.y && point.x < other.x)
}

function rowCharacters(row: Row, y: number) {
  const text: string[] = []
  const points: Point[] = []
  row.cells.forEach((cell, x) => {
    if (cell.wide === 2) return
    for (const unit of (cell.text || ' ').split('')) {
      text.push(unit)
      points.push({ x, y })
    }
  })
  return { text: text.join(''), points }
}

function occurrences(text: string, query: string) {
  const found: number[] = []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    found.push(index)
    index = haystack.indexOf(needle, index + needle.length)
  }
  return found
}

export class Terminal {
  readonly element: HTMLDivElement
  cols = 80
  rows = 24
  private readonly canvas: HTMLCanvasElement
  private readonly input: HTMLTextAreaElement
  private readonly scrollbar: HTMLDivElement
  private readonly thumb: HTMLDivElement
  private readonly context: CanvasRenderingContext2D
  private readonly core: GhosttyCore
  private readonly scanner = new OutputScanner()
  private readonly handlers: TerminalHandlers
  private readonly observer: ResizeObserver
  private options: TerminalOptions
  private appearance: Appearance
  private metrics: Metrics
  private snapshot: Snapshot | null = null
  private sized = false
  private fitted = false
  private frame = 0
  private forceFull = true
  private cursorOn = true
  private cursorTimer: number | null = null
  private syncTimer: number | null = null
  private renderedCursorY: number | null = null
  private focused = false
  private composing = false
  private readonly suppressedKeys = new Set<string>()
  private readonly heldOptionKeys = new Set<string>()
  private backlog: Chunk[] = []
  private shell: 'unknown' | 'prompt' | 'command' = 'unknown'
  private promptGeneration = 0
  private promptNative = false
  private promptInput = false
  private clickEvents = false
  private inputRef: number | null = null
  private clickMove: Point | null = null
  private blocked = false
  private epoch = 0
  private title = ''
  private progress: Progress = { state: 0, value: 0 }
  private notification = { id: '', title: '', body: '' }
  private images: Image[] = []
  private nextImage = 0
  private kittyBitmaps = new Map<string, OffscreenCanvas>()
  private kittyCommands = 0
  private hoveredLink: Link | null = null
  private linkPointer: number | null = null
  private mousePointer: number | null = null
  private mouseButton: number | null = null
  private lastMotion = ''
  private selectionPointer: number | null = null
  private selectionMode: 'cell' | 'word' | 'line' = 'cell'
  private selectionAnchor: Point | null = null
  private selectionBase: { start: Point; end: Point } | null = null
  private selectionMoved = false
  private selectionScroll: number | null = null
  private selectionScrollDelta = 0
  private selectionClient: { x: number; y: number } | null = null
  private clicks = { count: 0, time: 0, x: 0, y: 0 }
  private touch: { id: number; y: number; moved: boolean } | null = null
  private wheelRemainder = 0
  private scrollbarDrag: { id: number; offset: number } | null = null
  private query = ''
  private matches: Match[] = []
  private activeMatch = -1
  private matchesStale = false
  private findTimer: number | null = null
  private readonly findListeners = new Set<(results: FindResults) => void>()
  private disposed = false

  constructor(options: TerminalOptions, handlers: TerminalHandlers) {
    this.options = options
    this.handlers = handlers
    this.element = document.createElement('div')
    this.element.className = 'relative h-full overflow-hidden'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'absolute top-0 left-0 cursor-text touch-none'
    this.input = document.createElement('textarea')
    this.input.setAttribute('aria-label', 'Terminal input')
    this.input.autocapitalize = 'off'
    this.input.autocomplete = 'off'
    this.input.spellcheck = false
    this.input.style.cssText =
      'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0;resize:none;pointer-events:none;'
    this.scrollbar = document.createElement('div')
    this.scrollbar.className =
      'absolute top-0 right-0 bottom-0 w-2 cursor-default touch-none'
    this.scrollbar.hidden = true
    this.thumb = document.createElement('div')
    this.thumb.className =
      'bg-foreground/15 hover:bg-foreground/30 absolute inset-x-0.5 top-0 rounded-full'
    this.scrollbar.append(this.thumb)
    this.element.append(this.canvas, this.input, this.scrollbar)
    const context = this.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('canvas 2d is unavailable')
    this.context = context
    this.appearance = this.appearanceFor(options)
    this.metrics = measureCell(
      context,
      options.fontSize,
      this.appearance.fontFamily,
      options.lineHeight,
      window.devicePixelRatio || 1
    )
    this.core = new GhosttyCore(
      Math.max(1, Math.floor(window.innerWidth / this.metrics.width)),
      this.rows,
      options.scrollback,
      handlers.onReply,
      handlers.onBell
    )
    this.applyTerminalOptions()
    this.resizeCore()
    this.installEvents()
    this.observer = new ResizeObserver(() => this.fit())
    this.observer.observe(this.element)
  }

  setOptions(options: TerminalOptions) {
    this.options = options
    this.appearance = this.appearanceFor(options)
    this.metrics = measureCell(
      this.context,
      options.fontSize,
      this.appearance.fontFamily,
      options.lineHeight,
      window.devicePixelRatio || 1
    )
    if (!options.clickToMoveCursor) this.releaseInput()
    this.applyTerminalOptions()
    this.resizeCore()
    this.forceFull = true
    this.fit()
    this.requestRender()
  }

  write(data: Uint8Array, replay: boolean) {
    if (this.disposed) return
    this.backlog.push({ data, replay })
    if (!this.blocked) this.drain()
  }

  reset() {
    this.epoch += 1
    this.backlog = []
    this.blocked = false
    this.scanner.reset()
    this.releaseInput()
    this.shell = 'unknown'
    this.promptInput = false
    this.clickEvents = false
    this.core.reset()
    this.applyTerminalOptions()
    for (const image of this.images) this.removeImage(image)
    this.images = []
    this.core.clearSelection()
    this.forceFull = true
    this.requestRender()
  }

  focus() {
    this.input.focus({ preventScroll: true })
  }

  isKittyKeyboard() {
    return this.core.isKittyKeyboard()
  }

  paste(text: string) {
    const data = this.core.encodePaste(text)
    if (data.length > 0) this.sendInput(data)
  }

  presize(cols: number, rows: number) {
    if (this.fitted || (cols === this.cols && rows === this.rows)) return
    this.cols = cols
    this.rows = rows
    this.resizeCore()
  }

  fit() {
    if (this.disposed) return
    const width = this.element.clientWidth
    const height = this.element.clientHeight
    if (width === 0 || height === 0) {
      this.sized = false
      return
    }
    this.sized = true
    this.fitted = true
    const ratio = window.devicePixelRatio || 1
    const pixelWidth = Math.round(width * ratio)
    const pixelHeight = Math.round(height * ratio)
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
      this.canvas.style.width = `${width}px`
      this.canvas.style.height = `${height}px`
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.metrics = measureCell(
        this.context,
        this.options.fontSize,
        this.appearance.fontFamily,
        this.options.lineHeight,
        ratio
      )
      this.resizeCore()
      this.forceFull = true
    }
    const cols = Math.max(1, Math.floor(width / this.metrics.width))
    const rows = Math.max(1, Math.floor(height / this.metrics.height))
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols
      this.rows = rows
      this.resizeCore()
      this.forceFull = true
      this.handlers.onResize(cols, rows)
    }
    this.renderFrame()
  }

  find(text: string, backwards: boolean, incremental: boolean) {
    const previous = this.matches[this.activeMatch] ?? null
    this.query = text
    this.refreshMatches()
    if (this.matches.length === 0) {
      this.activeMatch = -1
    } else if (incremental || previous === null) {
      const from = previous?.row ?? this.viewportTop()
      const index = this.matches.findIndex((match) => match.row >= from)
      this.activeMatch = index === -1 ? this.matches.length - 1 : index
    } else {
      const index = this.matches.findIndex(
        (match) => match.row === previous.row && match.index === previous.index
      )
      const current = index === -1 ? 0 : index
      const step = backwards ? -1 : 1
      this.activeMatch =
        (current + step + this.matches.length) % this.matches.length
    }
    const active = this.matches[this.activeMatch]
    if (active) {
      const top = this.viewportTop()
      if (active.row < top || active.row >= top + this.rows)
        this.scrollViewport(active.row - top - Math.floor(this.rows / 2))
    }
    this.emitFindResults()
    this.forceFull = true
    this.requestRender()
  }

  onFindResults(listener: (results: FindResults) => void) {
    this.findListeners.add(listener)
    return () => {
      this.findListeners.delete(listener)
    }
  }

  clearFind() {
    this.query = ''
    this.matches = []
    this.activeMatch = -1
    this.forceFull = true
    this.requestRender()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.observer.disconnect()
    this.cancelRender()
    if (this.selectionScroll !== null)
      window.clearInterval(this.selectionScroll)
    if (this.findTimer !== null) window.clearTimeout(this.findTimer)
    window.removeEventListener('focus', this.onWindowFocus)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    for (const image of this.images) this.removeImage(image)
    this.core.dispose()
    this.element.remove()
  }

  private resizeCore() {
    this.core.resize(
      this.cols,
      this.rows,
      this.metrics.width,
      this.metrics.height,
      window.devicePixelRatio || 1
    )
  }

  private appearanceFor(options: TerminalOptions): Appearance {
    const colors = options.colors
    return {
      fontSize: options.fontSize,
      fontFamily: quoteFamilies(options.fontFamily),
      ligatures: options.ligatures,
      cursorText: colors.cursorText,
      selectionBackground: colors.selectionBackground,
      selectionForeground: colors.selectionForeground,
      matchBackground: colors.palette[8],
      activeMatchBorder: colors.palette[3],
    }
  }

  private applyTerminalOptions() {
    const colors = this.options.colors
    this.core.setColors({
      foreground: parseColor(colors.foreground),
      background: parseColor(colors.background),
      cursor: parseColor(colors.cursor),
      palette: colors.palette.map(parseColor),
    })
    this.core.setCursor(this.options.cursorStyle, this.options.cursorBlink)
    this.core.boldIsBright = this.options.boldIsBright
    this.core.version = this.options.version
    this.core.invalidate()
  }

  private drain() {
    while (!this.blocked && this.backlog.length > 0) {
      const chunk = this.backlog.shift()
      if (chunk) this.process(chunk)
    }
    const title = this.core.title()
    if (title !== this.title) {
      this.title = title
      this.handlers.onTitle(title)
    }
    if (this.query !== '') this.scheduleFindRefresh()
    this.cursorOn = true
    this.requestRender()
  }

  private process(chunk: Chunk) {
    const { data, replay } = chunk
    this.core.setReplies(!replay)
    let start = 0
    const consumed = this.scanner.scan(data, (event, end) => {
      this.core.write(data.subarray(start, end))
      start = end
      return this.handleOutput(event, replay)
    })
    this.core.write(data.subarray(start, consumed))
    if (consumed < data.length)
      this.backlog.unshift({ data: data.subarray(consumed), replay })
  }

  private handlePromptMark(text: string) {
    const native = text.startsWith('133;')
    const start = native ? 4 : 5
    if (text.length > start + 1 && text[start + 1] !== ';') return
    const kind = text.charAt(start)
    if (this.core.isAlternateScreen()) return
    if (kind === 'A') {
      const parts = text.split(';')
      if (parts.includes('k=s') || parts.includes('k=c')) return
      const clickEvents = native && parts.includes('click_events=1')
      const repaint = this.shell === 'prompt'
      const duplicate =
        repaint && !this.promptInput && this.promptNative !== native
      this.shell = 'prompt'
      this.promptNative = native
      if (this.options.clickToMoveCursor) this.trackInput()
      if (duplicate) {
        this.clickEvents = this.clickEvents || clickEvents
        return
      }
      this.promptInput = false
      this.clickEvents = clickEvents
      if (repaint) return
      this.promptGeneration += 1
      return
    }
    if (kind === 'B') {
      this.shell = 'prompt'
      this.promptInput = true
      if (this.options.clickToMoveCursor) this.trackInput()
      return
    }
    if (kind === 'C') {
      this.shell = 'command'
      return
    }
    if (kind === 'D') {
      if (this.shell === 'prompt' && !this.promptInput) return
      this.shell = 'unknown'
    }
  }

  private trackInput() {
    if (this.inputRef === null) this.inputRef = this.core.trackCursor()
    else this.core.retrack(this.inputRef)
  }

  private releaseInput() {
    if (this.inputRef !== null) this.core.untrack(this.inputRef)
    this.inputRef = null
  }

  private moveCursorTo(cell: Point) {
    const snapshot = this.snapshot
    if (
      !this.options.clickToMoveCursor ||
      this.shell !== 'prompt' ||
      this.inputRef === null ||
      snapshot === null ||
      snapshot.cursorX < 0 ||
      snapshot.cursorY < 0 ||
      this.core.isAlternateScreen() ||
      this.core.isMouseTracking()
    )
      return
    const input = this.core.trackedPoint(this.inputRef)
    if (input === null) return
    const top = this.viewportTop()
    const start = { x: input.x, y: input.y - top }
    if (isBefore(cell, start)) return
    if (this.clickEvents) {
      const state = this.core.scrollbarState()
      if (state === null) return
      const y = cell.y + top - (state.total - state.len)
      if (y < 0) return
      this.sendInput(`\x1b[<0;${cell.x + 1};${y + 1}M`)
      this.clearClickSelection()
      return
    }
    if (!this.promptInput) return
    const target = { x: cell.x, y: cell.y }
    if (
      target.x > 0 &&
      snapshot.rowData[target.y]?.cells[target.x]?.wide === CELL_WIDE.spacerTail
    )
      target.x -= 1
    const cursor = { x: snapshot.cursorX, y: snapshot.cursorY }
    if (isBefore(target, start) || isBefore(cursor, start)) return
    const left = isBefore(target, cursor)
    const from = left ? target : cursor
    const to = left ? cursor : target
    let count = 0
    for (let y = from.y; y <= to.y; y += 1) {
      const row = snapshot.rowData[y]
      if (row === undefined) return
      const last = y === to.y ? to.x : row.cells.length
      for (let x = y === from.y ? from.x : 0; x < last; x += 1)
        if (row.cells[x].text !== '') count += 1
      if (y < to.y && !row.wrapsToNext) {
        if (left) return
        break
      }
    }
    const key = left ? 'ArrowLeft' : 'ArrowRight'
    const data = this.core.encodeKey(
      new KeyboardEvent('keydown', { key, code: key })
    )
    if (count > 0 && data.length > 0) this.sendInput(data.repeat(count))
    this.clearClickSelection()
  }

  private clearClickSelection() {
    this.core.clearSelection()
    this.forceFull = true
    this.requestRender()
  }

  private handleOutput(event: OutputEvent, replay: boolean) {
    if (event.type === 'sixel') return this.decodeImage(decodeSixel(event.data))
    const text = latin1.decode(event.data)
    if (text.startsWith('1337;File='))
      return this.decodeImage(
        decodeInlineImage(text.slice('1337;File='.length), {
          cellWidth: this.metrics.width,
          cellHeight: this.metrics.height,
          width: this.cols * this.metrics.width,
          height: this.rows * this.metrics.height,
          pixelRatio: window.devicePixelRatio || 1,
        })
      )
    if (text.startsWith('133;') || text.startsWith('6973;')) {
      this.handlePromptMark(text)
      return false
    }
    if (text.startsWith('52;')) {
      const parts = text.split(';')
      const payload = parts[2]
      if (replay || payload === undefined) return false
      if (payload === '?') {
        this.handlers.onClipboardRead({
          selection: xtermSelection(parts[1]),
          terminator: event.terminator,
          generation: this.promptGeneration,
          epoch: this.epoch,
          atPrompt: this.shell === 'prompt',
        })
        return false
      }
      try {
        const bytes = Uint8Array.from(atob(payload), (character) =>
          character.charCodeAt(0)
        )
        this.handlers.onClipboard(decoder.decode(bytes))
      } catch (error) {
        console.warn('invalid clipboard sequence', error)
      }
      return false
    }
    if (text === '10;?' || text === '11;?' || text === '12;?') {
      if (!replay) this.replyColor(text, event.terminator)
      return false
    }
    if (text.startsWith('4;')) {
      if (!replay) this.replyPalette(text, event.terminator)
      return false
    }
    if (text === '9;4' || text.startsWith('9;4;')) {
      this.handleProgress(text)
      return false
    }
    if (replay) return false
    if (text.startsWith('9;') && !/^9;\d+(;|$)/.test(text)) {
      this.handlers.onNotify('', decoder.decode(event.data.subarray(2)))
      return false
    }
    if (text.startsWith('777;notify;')) {
      const parts = decoder.decode(event.data).split(';')
      this.handlers.onNotify(parts[2] ?? '', parts.slice(3).join(';'))
      return false
    }
    if (text.startsWith('99;'))
      this.handleKittyNotification(decoder.decode(event.data))
    return false
  }

  private handleKittyNotification(text: string) {
    const separator = text.indexOf(';', 3)
    if (separator === -1) return
    const fields = new Map<string, string>()
    for (const field of text.slice(3, separator).split(':')) {
      const equals = field.indexOf('=')
      if (equals !== -1)
        fields.set(field.slice(0, equals), field.slice(equals + 1))
    }
    const kind = fields.get('p') ?? 'title'
    if (kind === '?' || kind === 'close' || kind === 'alive') return
    let payload = text.slice(separator + 1)
    if (fields.get('e') === '1') {
      try {
        payload = decoder.decode(
          Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
        )
      } catch (error) {
        console.warn('invalid notification sequence', error)
        return
      }
    }
    const id = fields.get('i') ?? ''
    if (id !== this.notification.id)
      this.notification = { id, title: '', body: '' }
    if (kind === 'title') this.notification.title += payload
    if (kind === 'body') this.notification.body += payload
    if (fields.get('d') === '0') return
    const notification = this.notification
    this.notification = { id: '', title: '', body: '' }
    if (notification.title !== '' || notification.body !== '')
      this.handlers.onNotify(notification.title, notification.body)
  }

  replyClipboard(text: string, query: ClipboardQuery) {
    if (
      query.epoch !== this.epoch ||
      query.generation !== this.promptGeneration ||
      (query.atPrompt && this.shell !== 'prompt')
    )
      return
    const binary = Array.from(new TextEncoder().encode(text), (byte) =>
      String.fromCharCode(byte)
    ).join('')
    this.handlers.onReply(
      `\x1b]52;${query.selection};${btoa(binary)}${query.terminator}`
    )
  }

  private replyColor(query: '10;?' | '11;?' | '12;?', terminator: string) {
    const colors = this.core.currentColors()
    const color =
      query === '10;?'
        ? colors.foreground
        : query === '11;?'
          ? colors.background
          : colors.cursor
    this.handlers.onReply(
      `\x1b]${query.slice(0, 2)};${colorSpec(color)}${terminator}`
    )
  }

  private replyPalette(text: string, terminator: string) {
    const parts = text.split(';')
    const palette = this.core.currentColors().palette
    for (let index = 1; index + 1 < parts.length; index += 2) {
      if (parts[index + 1] !== '?' || !/^\d+$/.test(parts[index])) continue
      const color = palette[Number(parts[index])]
      if (color === undefined) continue
      this.handlers.onReply(
        `\x1b]4;${parts[index]};${colorSpec(color)}${terminator}`
      )
    }
  }

  private handleProgress(text: string) {
    const parts = text.split(';')
    if (parts.length > 4) return
    const state =
      parts[2] === undefined || parts[2] === '' ? 0 : Number(parts[2])
    const value =
      parts[3] === undefined || parts[3] === '' ? -1 : Number(parts[3])
    if (!Number.isInteger(state) || !Number.isInteger(value)) return
    if (state === 0) this.progress = { state, value: 0 }
    else if (state === 1) {
      if (value < 0) return
      this.progress = { state, value: percent(value) }
    } else if (state === 2 || state === 4) {
      if (value < 0) this.progress = { state, value: this.progress.value }
      else
        this.progress = { state, value: percent(value || this.progress.value) }
    } else if (state === 3)
      this.progress = { state, value: this.progress.value }
    else return
    this.handlers.onProgress(this.progress)
  }

  private decodeImage(decoding: Promise<ImageBitmap | null>) {
    const epoch = this.epoch
    const pixelRatio = window.devicePixelRatio || 1
    this.blocked = true
    decoding
      .then((bitmap) => {
        if (!bitmap) return
        if (epoch !== this.epoch || this.disposed) {
          bitmap.close()
          return
        }
        this.placeImage(bitmap, pixelRatio)
      })
      .catch((error: unknown) => console.warn('could not decode image', error))
      .finally(() => {
        if (epoch !== this.epoch || this.disposed) return
        this.blocked = false
        this.drain()
      })
    return true
  }

  private placeImage(bitmap: ImageBitmap, pixelRatio: number) {
    const marker = `sshtty-image:${this.nextImage++}`
    const encoder = new TextEncoder()
    this.core.write(encoder.encode(`\x1b]8;;${marker}\x1b\\ \x1b]8;;\x1b\\\b`))
    const image = {
      ref: this.core.trackCursor(),
      marker,
      bitmap,
      width: bitmap.width / pixelRatio,
      height: bitmap.height / pixelRatio,
      alternate: this.core.isAlternateScreen(),
    }
    this.images.push(image)
    if (this.images.length > IMAGE_LIMIT) {
      const oldest = this.images.shift()
      if (oldest) this.removeImage(oldest)
    }
    const rows = Math.ceil(image.height / this.metrics.height)
    if (rows > 1) this.core.write(encoder.encode('\x1bD'.repeat(rows - 1)))
  }

  private removeImage(image: Image) {
    this.core.untrack(image.ref)
    image.bitmap.close()
  }

  beforeInput(data: string) {
    if (this.shell === 'prompt') {
      const ending = [
        '\r',
        '\n',
        '\x03',
        '\x04',
        '\x0f',
        '\x1a',
        '\x1b[99;5u',
        '\x1b[100;5u',
        '\x1b[111;5u',
        '\x1b[122;5u',
      ].some((sequence) => data.includes(sequence))
      if (ending) this.shell = 'unknown'
    }
  }

  private sendInput(data: string) {
    this.beforeInput(data)
    if (this.core.scrollbarState()?.offset !== this.maxOffset()) {
      this.core.scrollToBottom()
      this.forceFull = true
      this.requestRender()
    }
    this.handlers.onData(data)
  }

  private maxOffset() {
    const state = this.core.scrollbarState()
    return state ? Math.max(0, state.total - state.len) : 0
  }

  private viewportTop() {
    return this.core.toScreen({ x: 0, y: 0 })?.y ?? 0
  }

  private refreshMatches() {
    this.matchesStale = false
    this.matches = []
    if (this.query === '') return
    this.core
      .screenText()
      .split('\n')
      .forEach((line, row) => {
        occurrences(line, this.query).forEach((_, index) =>
          this.matches.push({ row, index })
        )
      })
  }

  private scheduleFindRefresh() {
    this.matchesStale = true
    if (this.findTimer !== null) return
    this.findTimer = window.setTimeout(() => {
      this.findTimer = null
      if (!this.matchesStale || this.query === '') return
      const active = this.matches[this.activeMatch]
      this.refreshMatches()
      const index = active
        ? this.matches.findIndex(
            (match) => match.row === active.row && match.index === active.index
          )
        : -1
      this.activeMatch = index === -1 ? this.matches.length - 1 : index
      this.emitFindResults()
      this.forceFull = true
      this.requestRender()
    }, 200)
  }

  private emitFindResults() {
    const results = {
      resultIndex: this.activeMatch,
      resultCount: this.matches.length,
    }
    for (const listener of this.findListeners) listener(results)
  }

  private highlights(snapshot: Snapshot) {
    if (this.query === '') return []
    const top = this.viewportTop()
    const active = this.matches[this.activeMatch]
    const highlights: Highlight[] = []
    snapshot.rowData.forEach((row, y) => {
      const { text, points } = rowCharacters(row, y)
      occurrences(text, this.query).forEach((offset, index) => {
        const start = points[offset]
        const end = points[offset + this.query.length - 1]
        if (!start || !end) return
        highlights.push({
          row: y,
          start: start.x,
          end: end.x + 1,
          active: active?.row === top + y && active.index === index,
        })
      })
    })
    return highlights
  }

  private requestRender() {
    if (this.disposed || !this.sized || this.frame !== 0) return
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.renderFrame()
    })
  }

  private cancelRender() {
    if (this.frame !== 0) window.cancelAnimationFrame(this.frame)
    this.frame = 0
    if (this.cursorTimer !== null) window.clearTimeout(this.cursorTimer)
    this.cursorTimer = null
    if (this.syncTimer !== null) window.clearTimeout(this.syncTimer)
    this.syncTimer = null
  }

  private renderFrame() {
    if (this.disposed || !this.sized || !this.element.isConnected) return
    if (this.frame !== 0) {
      window.cancelAnimationFrame(this.frame)
      this.frame = 0
    }
    if (this.core.isSynchronizedOutput()) {
      if (this.syncTimer === null)
        this.syncTimer = window.setTimeout(() => {
          this.syncTimer = null
          this.core.endSynchronizedOutput()
          this.requestRender()
        }, SYNC_TIMEOUT)
      return
    }
    if (this.syncTimer !== null) window.clearTimeout(this.syncTimer)
    this.syncTimer = null
    const snapshot = this.core.snapshot()
    this.snapshot = snapshot
    const blinking = this.blinking()
    if (!blinking) this.cursorOn = true
    const images = this.visibleImages()
    const kitty = this.kittyImages()
    render({
      context: this.context,
      snapshot,
      metrics: this.metrics,
      appearance: this.appearance,
      forceFull: this.forceFull || images.length > 0 || kitty.length > 0,
      cursorOn: this.cursorOn,
      previousCursorY: this.renderedCursorY,
      focused: this.focused,
      hoveredLink: this.hoveredLink?.range ?? null,
      highlights: this.highlights(snapshot),
      pixelRatio: window.devicePixelRatio || 1,
      drawLayer: (layer) => this.drawKitty(kitty, layer),
    })
    this.drawKitty(kitty, 'aboveText')
    for (const image of images)
      this.context.drawImage(
        image.bitmap,
        image.x * this.metrics.width,
        image.y * this.metrics.height,
        image.width,
        image.height
      )
    this.forceFull = images.length > 0 || kitty.length > 0
    this.renderedCursorY =
      this.cursorOn && snapshot.cursorVisible && snapshot.cursorY >= 0
        ? snapshot.cursorY
        : null
    if (snapshot.cursorX >= 0 && snapshot.cursorY >= 0) {
      this.input.style.left = `${snapshot.cursorX * this.metrics.width}px`
      this.input.style.top = `${snapshot.cursorY * this.metrics.height}px`
    }
    this.updateScrollbar()
    if (this.cursorTimer !== null) window.clearTimeout(this.cursorTimer)
    this.cursorTimer = null
    if (blinking)
      this.cursorTimer = window.setTimeout(() => {
        this.cursorTimer = null
        this.cursorOn = !this.cursorOn
        this.requestRender()
      }, BLINK_INTERVAL)
  }

  private blinking() {
    const snapshot = this.snapshot
    return (
      snapshot !== null &&
      this.focused &&
      snapshot.cursorBlinking &&
      snapshot.cursorVisible
    )
  }

  private visibleImages() {
    if (this.images.length === 0) return []
    const alternate = this.core.isAlternateScreen()
    const top = this.viewportTop()
    const visible: {
      bitmap: ImageBitmap
      width: number
      height: number
      x: number
      y: number
    }[] = []
    const kept: Image[] = []
    for (const image of this.images) {
      if (image.alternate !== alternate) {
        kept.push(image)
        continue
      }
      const point = this.core.trackedPoint(image.ref)
      if (
        point === null ||
        this.core.trackedHyperlink(image.ref) !== image.marker
      ) {
        this.removeImage(image)
        continue
      }
      kept.push(image)
      const y = point.y - top
      const rows = Math.ceil(image.height / this.metrics.height)
      if (y + rows <= 0 || y >= this.rows) continue
      visible.push({
        bitmap: image.bitmap,
        width: image.width,
        height: image.height,
        x: point.x,
        y,
      })
    }
    this.images = kept
    return visible
  }

  private kittyImages() {
    if (this.core.kittyCommands !== this.kittyCommands) {
      this.kittyCommands = this.core.kittyCommands
      this.kittyBitmaps.clear()
    }
    const bitmaps = new Map<string, OffscreenCanvas>()
    const images = this.core.kittyPlacements().map((placement) => {
      const bitmap =
        bitmaps.get(placement.key) ??
        this.kittyBitmaps.get(placement.key) ??
        kittyBitmap(placement.image)
      bitmaps.set(placement.key, bitmap)
      return { placement, bitmap }
    })
    this.kittyBitmaps = bitmaps
    return images
  }

  private drawKitty(
    images: { placement: KittyPlacement; bitmap: OffscreenCanvas }[],
    layer: ImageLayer
  ) {
    const cell = this.core.cellSize()
    const scaleX = this.metrics.width / cell.width
    const scaleY = this.metrics.height / cell.height
    for (const { placement, bitmap } of images) {
      if (kittyLayer(placement.z) !== layer) continue
      this.context.drawImage(
        bitmap,
        placement.source.x,
        placement.source.y,
        placement.source.width,
        placement.source.height,
        placement.column * this.metrics.width + placement.xOffset * scaleX,
        placement.row * this.metrics.height + placement.yOffset * scaleY,
        placement.width * scaleX,
        placement.height * scaleY
      )
    }
  }

  private updateScrollbar() {
    const state = this.core.scrollbarState()
    const height = this.element.clientHeight
    const geometry =
      state === null ? null : this.scrollbarGeometry(state, height)
    this.scrollbar.hidden = geometry === null
    if (geometry === null) return
    this.thumb.style.height = `${geometry.thumbHeight}px`
    this.thumb.style.transform = `translateY(${geometry.thumbTop}px)`
  }

  private scrollbarGeometry(state: Scrollbar, height: number) {
    const maxOffset = Math.max(0, state.total - state.len)
    if (height <= 0 || state.len <= 0 || maxOffset === 0) return null
    const thumbHeight = Math.min(
      height,
      Math.max(20, (height * state.len) / state.total)
    )
    const travel = height - thumbHeight
    return {
      thumbHeight,
      thumbTop: travel * (Math.min(state.offset, maxOffset) / maxOffset),
      travel,
      maxOffset,
    }
  }

  private scrollViewport(delta: number) {
    const state = this.core.scrollbarState()
    let rows = Math.trunc(delta)
    if (state !== null) {
      const maxOffset = Math.max(0, state.total - state.len)
      rows =
        Math.max(0, Math.min(state.offset + rows, maxOffset)) - state.offset
    }
    if (rows === 0) return
    this.core.scroll(rows)
    this.forceFull = true
    this.requestRender()
  }

  private scrollRows(pixels: number, event: MouseEvent) {
    const total = this.wheelRemainder + pixels / this.metrics.height
    const rows = Math.trunc(total)
    this.wheelRemainder = total - rows
    if (rows === 0) return
    if (this.reportsMouse(event)) {
      for (let index = 0; index < Math.abs(rows); index += 1)
        this.sendMouse('press', rows < 0 ? 4 : 5, event)
      return
    }
    if (this.core.isAlternateScreen()) {
      const application = this.core.isApplicationCursorKeys()
      const sequence =
        rows < 0
          ? application
            ? '\x1bOA'
            : '\x1b[A'
          : application
            ? '\x1bOB'
            : '\x1b[B'
      this.handlers.onData(sequence.repeat(Math.abs(rows)))
      return
    }
    this.scrollViewport(rows)
  }

  private cellAt(clientX: number, clientY: number): Point {
    const bounds = this.canvas.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(
          this.cols - 1,
          Math.floor((clientX - bounds.left) / this.metrics.width)
        )
      ),
      y: Math.max(
        0,
        Math.min(
          this.rows - 1,
          Math.floor((clientY - bounds.top) / this.metrics.height)
        )
      ),
    }
  }

  private reportsMouse(event: MouseEvent) {
    return (
      this.core.isMouseTracking() &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey
    )
  }

  private sendMouse(
    action: 'press' | 'release' | 'motion',
    button: number | null,
    event: MouseEvent
  ) {
    const bounds = this.canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const data = this.core.encodeMouse({
      action,
      button,
      mods:
        (event.shiftKey ? 1 : 0) |
        (event.ctrlKey ? 1 << 1 : 0) |
        (event.altKey ? 1 << 2 : 0) |
        (event.metaKey ? 1 << 3 : 0),
      x: Math.max(0, event.clientX - bounds.left) * ratio,
      y: Math.max(0, event.clientY - bounds.top) * ratio,
      screenWidth: this.cols * this.metrics.width * ratio,
      screenHeight: this.rows * this.metrics.height * ratio,
      cellWidth: this.metrics.width * ratio,
      cellHeight: this.metrics.height * ratio,
      anyButtonPressed: event.buttons !== 0,
    })
    if (data.length === 0) return
    if (action === 'motion') {
      if (data === this.lastMotion) return
      this.lastMotion = data
    } else {
      this.lastMotion = ''
    }
    this.handlers.onData(data)
  }

  private linkAt(clientX: number, clientY: number): Link | null {
    const snapshot = this.snapshot
    if (!snapshot) return null
    const bounds = this.canvas.getBoundingClientRect()
    const gridX = clientX - bounds.left
    const gridY = clientY - bounds.top
    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX >= this.cols * this.metrics.width ||
      gridY >= this.rows * this.metrics.height
    )
      return null
    const cell = {
      x: Math.floor(gridX / this.metrics.width),
      y: Math.floor(gridY / this.metrics.height),
    }
    const explicit = this.core.hyperlinkAt(cell.x, cell.y)
    if (explicit !== null) {
      if (explicit.startsWith('sshtty-image:')) return null
      let start = cell.x
      let end = cell.x
      while (start > 0 && this.core.hyperlinkAt(start - 1, cell.y) === explicit)
        start -= 1
      while (
        end < this.cols - 1 &&
        this.core.hyperlinkAt(end + 1, cell.y) === explicit
      )
        end += 1
      return {
        uri: explicit,
        range: { start: { x: start, y: cell.y }, end: { x: end, y: cell.y } },
      }
    }
    let first = cell.y
    while (first > 0 && snapshot.rowData[first]?.isWrapContinuation) first -= 1
    let last = cell.y
    while (last < snapshot.rows - 1 && snapshot.rowData[last]?.wrapsToNext)
      last += 1
    let text = ''
    const points: Point[] = []
    for (let y = first; y <= last; y += 1) {
      const row = snapshot.rowData[y]
      if (!row) break
      const characters = rowCharacters(row, y)
      text += characters.text
      points.push(...characters.points)
    }
    for (const match of text.matchAll(URL_PATTERN)) {
      const uri = match[0].replace(/[.,;:!?)\]}'"]+$/, '')
      const startPoint = points[match.index]
      const endPoint = points[match.index + uri.length - 1]
      if (!startPoint || !endPoint) continue
      const range = { start: startPoint, end: endPoint }
      const inside =
        (cell.y > range.start.y ||
          (cell.y === range.start.y && cell.x >= range.start.x)) &&
        (cell.y < range.end.y ||
          (cell.y === range.end.y && cell.x <= range.end.x))
      if (inside) return { uri, range }
    }
    return null
  }

  private setHoveredLink(link: Link | null) {
    const previous = this.hoveredLink
    this.canvas.style.cursor = link ? 'pointer' : ''
    if (
      previous?.uri === link?.uri &&
      previous?.range.start.x === link?.range.start.x &&
      previous?.range.start.y === link?.range.start.y
    )
      return
    this.hoveredLink = link
    this.forceFull = true
    this.requestRender()
  }

  private beginSelection(event: PointerEvent, count: number) {
    const cell = this.cellAt(event.clientX, event.clientY)
    const screen = this.core.toScreen(cell)
    if (!screen) return
    this.selectionMoved = false
    this.selectionMode = count >= 3 ? 'line' : count === 2 ? 'word' : 'cell'
    const range =
      this.selectionMode === 'line'
        ? this.core.selectLine(screen)
        : this.selectionMode === 'word'
          ? this.core.selectWord(screen)
          : null
    this.selectionAnchor = range ? range.start : screen
    this.selectionBase = range
    if (range) {
      this.core.setSelection(range.start, range.end)
    } else {
      this.selectionMode = 'cell'
      this.core.setSelection(screen, screen)
    }
    this.forceFull = true
    this.requestRender()
  }

  private extendSelection(clientX: number, clientY: number) {
    const anchor = this.selectionAnchor
    if (!anchor) return
    const cell = this.cellAt(clientX, clientY)
    const screen = this.core.toScreen(cell)
    if (!screen) return
    this.selectionMoved = true
    const base = this.selectionBase
    if (base === null) {
      this.core.setSelection(anchor, screen)
    } else {
      const range =
        this.selectionMode === 'line'
          ? this.core.selectLine(screen)
          : this.core.selectWord(screen)
      const before =
        screen.y < base.start.y ||
        (screen.y === base.start.y && screen.x < base.start.x)
      this.core.setSelection(
        before ? base.end : base.start,
        range ? (before ? range.start : range.end) : screen
      )
    }
    this.forceFull = true
    this.requestRender()
  }

  private setSelectionScroll(delta: number) {
    this.selectionScrollDelta = delta
    if (delta === 0) {
      if (this.selectionScroll !== null)
        window.clearInterval(this.selectionScroll)
      this.selectionScroll = null
      return
    }
    if (this.selectionScroll !== null) return
    this.selectionScroll = window.setInterval(() => {
      this.scrollViewport(this.selectionScrollDelta)
      const client = this.selectionClient
      if (client) this.extendSelection(client.x, client.y)
    }, 80)
  }

  private copySelection() {
    const text = this.core.selectionText()
    if (text.length === 0) return
    if (!window.isSecureContext) {
      console.warn('copy from the terminal needs https or localhost')
      return
    }
    void navigator.clipboard.writeText(text)
  }

  private optionIsMeta(event: KeyboardEvent) {
    if (!isMac || !event.altKey || event.metaKey) return false
    const mode = this.options.optionAsMeta
    if (mode === 'off') return false
    if (mode === 'both') return true
    if (mode === 'left') return this.heldOptionKeys.has('AltLeft')
    if (mode === 'right') return this.heldOptionKeys.has('AltRight')
    throw new Error(`unknown option as meta mode ${mode}`)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'AltLeft' || event.code === 'AltRight')
      this.heldOptionKeys.add(event.code)
    if (!this.handlers.beforeKey(event)) {
      this.suppressedKeys.add(event.code)
      return
    }
    const optionKey = this.optionIsMeta(event)
    const optionAsMeta = optionKey && this.core.metaText(event) !== null
    if (
      event.isComposing ||
      this.composing ||
      (!optionAsMeta && (event.key === 'Process' || event.keyCode === 229))
    ) {
      this.suppressedKeys.add(event.code)
      return
    }
    if (
      isMac &&
      this.options.optionAsMeta !== 'off' &&
      !optionKey &&
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      ([...event.key].length === 1 || event.key === 'Dead')
    ) {
      this.suppressedKeys.add(event.code)
      return
    }
    if (
      !optionAsMeta &&
      event.getModifierState('AltGraph') &&
      [...event.key].length === 1
    ) {
      this.suppressedKeys.add(event.code)
      return
    }
    const key = event.key.toLowerCase()
    const copy = isMac
      ? event.metaKey && key === 'c'
      : (event.ctrlKey && event.shiftKey && key === 'c') ||
        (event.ctrlKey && !event.shiftKey && key === 'insert')
    if (copy) {
      this.copySelection()
      event.preventDefault()
      this.suppressedKeys.add(event.code)
      return
    }
    const paste = isMac
      ? event.metaKey && key === 'v'
      : (event.ctrlKey && event.shiftKey && key === 'v') ||
        (event.shiftKey && !event.ctrlKey && key === 'insert')
    if (paste) {
      this.suppressedKeys.add(event.code)
      return
    }
    if (isMac && event.metaKey && key === 'q') {
      this.suppressedKeys.add(event.code)
      return
    }
    const data = this.core.encodeKey(event, 'press', optionAsMeta)
    if (data.length === 0) return
    this.suppressedKeys.delete(event.code)
    event.preventDefault()
    event.stopPropagation()
    if (this.core.selectionText().length > 0 && !event.shiftKey) {
      this.core.clearSelection()
      this.forceFull = true
    }
    this.sendInput(data)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.heldOptionKeys.delete(event.code)
    if (this.suppressedKeys.delete(event.code)) return
    if (event.isComposing || this.composing) return
    const data = this.core.encodeKey(event, 'release', this.optionIsMeta(event))
    if (data.length === 0) return
    event.preventDefault()
    this.handlers.onData(data)
  }

  private readonly onInput = (event: Event) => {
    const inputEvent = event as InputEvent
    if (this.composing || inputEvent.isComposing) return
    const data = this.input.value || inputEvent.data || ''
    this.input.value = ''
    if (data.length > 0) this.sendInput(data)
  }

  private readonly onCompositionStart = () => {
    this.composing = true
  }

  private readonly onCompositionEnd = (event: CompositionEvent) => {
    this.composing = false
    const data = this.input.value || event.data
    this.input.value = ''
    if (data.length > 0) this.sendInput(data)
  }

  private readonly onPaste = (event: ClipboardEvent) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (text.length > 0) this.paste(text)
  }

  private readonly onCopy = (event: ClipboardEvent) => {
    const text = this.core.selectionText()
    if (text.length === 0 || !event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', text)
  }

  private readonly onWindowFocus = () => {
    if (isMac && this.options.optionAsMeta !== 'off')
      this.core.refreshKeyboardLayout()
  }

  private readonly onContextRestored = () => {
    const ratio = window.devicePixelRatio || 1
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.forceFull = true
    this.requestRender()
  }

  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    this.forceFull = true
    this.requestRender()
  }

  private readonly onFocus = () => {
    this.focused = true
    this.cursorOn = true
    this.requestRender()
    if (!this.disposed && this.core.isFocusReporting())
      this.handlers.onReply('\x1b[I')
  }

  private readonly onBlur = () => {
    this.focused = false
    this.heldOptionKeys.clear()
    this.cursorOn = true
    this.requestRender()
    if (!this.disposed && this.core.isFocusReporting())
      this.handlers.onReply('\x1b[O')
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.focus()
    if (event.pointerType === 'touch') {
      this.touch = { id: event.pointerId, y: event.clientY, moved: false }
      this.canvas.setPointerCapture(event.pointerId)
      return
    }
    if (this.reportsMouse(event)) {
      const button = mouseButton(event.button)
      if (button === null) return
      event.preventDefault()
      this.mousePointer = event.pointerId
      this.mouseButton = button
      this.sendMouse('press', button, event)
      this.canvas.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) return
    const link = this.linkAt(event.clientX, event.clientY)
    if (link && (isMac ? event.metaKey : event.ctrlKey)) {
      event.preventDefault()
      this.linkPointer = event.pointerId
      return
    }
    const repeat =
      event.timeStamp - this.clicks.time <= MULTI_CLICK_INTERVAL &&
      Math.hypot(
        event.clientX - this.clicks.x,
        event.clientY - this.clicks.y
      ) <= 4
    this.clicks = {
      count: repeat ? (this.clicks.count >= 3 ? 1 : this.clicks.count + 1) : 1,
      time: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    }
    this.clickMove =
      !event.altKey &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      this.options.clickToMoveCursor &&
      this.clicks.count === 1
        ? this.cellAt(event.clientX, event.clientY)
        : null
    this.selectionPointer = event.pointerId
    this.beginSelection(event, this.clicks.count)
    this.canvas.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const touch = this.touch
    if (touch?.id === event.pointerId) {
      const delta = touch.y - event.clientY
      if (Math.abs(delta) < 1) return
      touch.y = event.clientY
      touch.moved = true
      this.scrollRows(delta, event)
      return
    }
    if (
      this.mousePointer === event.pointerId ||
      (this.core.isMouseAnyEventTracking() && this.reportsMouse(event))
    ) {
      const buttons = event.buttons
      const button = buttons & 1 ? 1 : buttons & 4 ? 3 : buttons & 2 ? 2 : null
      this.sendMouse('motion', button, event)
      return
    }
    if (this.selectionPointer === event.pointerId) {
      const cell = this.cellAt(event.clientX, event.clientY)
      if (
        this.clickMove !== null &&
        (cell.x !== this.clickMove.x || cell.y !== this.clickMove.y)
      )
        this.clickMove = null
      this.selectionClient = { x: event.clientX, y: event.clientY }
      const bounds = this.canvas.getBoundingClientRect()
      this.setSelectionScroll(
        event.clientY < bounds.top ? -1 : event.clientY > bounds.bottom ? 1 : 0
      )
      this.extendSelection(event.clientX, event.clientY)
      return
    }
    this.setHoveredLink(this.linkAt(event.clientX, event.clientY))
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.canvas.hasPointerCapture(event.pointerId))
      this.canvas.releasePointerCapture(event.pointerId)
    if (this.touch?.id === event.pointerId) {
      this.touch = null
      return
    }
    if (this.linkPointer === event.pointerId) {
      this.linkPointer = null
      const link = this.linkAt(event.clientX, event.clientY)
      if (link && event.type === 'pointerup')
        this.handlers.onLink(link.uri, event)
      return
    }
    if (this.mousePointer === event.pointerId) {
      this.sendMouse('release', this.mouseButton, event)
      this.mousePointer = null
      this.mouseButton = null
      return
    }
    if (this.selectionPointer === event.pointerId) {
      this.selectionPointer = null
      this.setSelectionScroll(0)
      if (!this.selectionMoved && this.selectionMode === 'cell') {
        this.core.clearSelection()
        this.selectionAnchor = null
        this.forceFull = true
        this.requestRender()
      }
      const cell = this.clickMove
      this.clickMove = null
      if (cell !== null && event.type === 'pointerup') this.moveCursorTo(cell)
    }
  }

  private readonly onPointerLeave = () => {
    this.lastMotion = ''
    this.setHoveredLink(null)
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const pixels =
      event.deltaMode === 1
        ? event.deltaY * this.metrics.height
        : event.deltaMode === 2
          ? event.deltaY * this.rows * this.metrics.height
          : event.deltaY
    this.scrollRows(pixels, event)
  }

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) event.preventDefault()
    this.focus()
  }

  private readonly onScrollbarDown = (event: PointerEvent) => {
    const state = this.core.scrollbarState()
    if (event.button !== 0 || state === null) return
    const bounds = this.scrollbar.getBoundingClientRect()
    const geometry = this.scrollbarGeometry(state, bounds.height)
    if (geometry === null) return
    event.preventDefault()
    event.stopPropagation()
    this.scrollbarDrag = {
      id: event.pointerId,
      offset:
        event.target === this.thumb
          ? event.clientY - bounds.top - geometry.thumbTop
          : geometry.thumbHeight / 2,
    }
    this.scrollbar.setPointerCapture(event.pointerId)
    this.dragScrollbar(event.clientY)
  }

  private readonly onScrollbarMove = (event: PointerEvent) => {
    if (this.scrollbarDrag?.id !== event.pointerId) return
    event.preventDefault()
    this.dragScrollbar(event.clientY)
  }

  private readonly onScrollbarUp = (event: PointerEvent) => {
    if (this.scrollbarDrag?.id !== event.pointerId) return
    this.scrollbarDrag = null
    if (this.scrollbar.hasPointerCapture(event.pointerId))
      this.scrollbar.releasePointerCapture(event.pointerId)
  }

  private dragScrollbar(clientY: number) {
    const state = this.core.scrollbarState()
    const drag = this.scrollbarDrag
    if (state === null || drag === null) return
    const bounds = this.scrollbar.getBoundingClientRect()
    const geometry = this.scrollbarGeometry(state, bounds.height)
    if (geometry === null || geometry.travel === 0) return
    const top = Math.max(
      0,
      Math.min(clientY - bounds.top - drag.offset, geometry.travel)
    )
    const offset = Math.round((top / geometry.travel) * geometry.maxOffset)
    this.scrollViewport(offset - state.offset)
  }

  private installEvents() {
    this.input.addEventListener('keydown', this.onKeyDown)
    this.input.addEventListener('keyup', this.onKeyUp)
    this.input.addEventListener('input', this.onInput)
    this.input.addEventListener('compositionstart', this.onCompositionStart)
    this.input.addEventListener('compositionend', this.onCompositionEnd)
    this.input.addEventListener('paste', this.onPaste)
    this.input.addEventListener('copy', this.onCopy)
    this.input.addEventListener('focus', this.onFocus)
    this.input.addEventListener('blur', this.onBlur)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    this.canvas.addEventListener('contextrestored', this.onContextRestored)
    this.scrollbar.addEventListener('pointerdown', this.onScrollbarDown)
    this.scrollbar.addEventListener('pointermove', this.onScrollbarMove)
    this.scrollbar.addEventListener('pointerup', this.onScrollbarUp)
    this.scrollbar.addEventListener('pointercancel', this.onScrollbarUp)
    window.addEventListener('focus', this.onWindowFocus)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }
}
