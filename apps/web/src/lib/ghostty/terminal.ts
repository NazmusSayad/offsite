import { type CursorStyle, GhosttyCore, type Point } from './core'
import { Find, type FindResults } from './find'
import { decodeInlineImage, decodeSixel, InlineImages } from './images'
import { drawKitty } from './kitty'
import {
  clipboardReply,
  clipboardText,
  colorReply,
  KittyNotifications,
  nextProgress,
  paletteReplies,
  type Progress,
  textNotification,
  xtermSelection,
} from './osc'
import { type OutputEvent, OutputScanner } from './output'
import { Pointer } from './pointer'
import { Prompt } from './prompt'
import type { Color, Snapshot } from './render-state'
import { type Appearance, type Metrics, measureCell, render } from './renderer'

export type { FindResults } from './find'
export type { Progress } from './osc'

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

export type ClipboardQuery = {
  selection: string
  terminator: string
  generation: number
  epoch: number
  atPrompt: boolean
}

type Chunk = { data: Uint8Array; replay: boolean }

const isMac = navigator.userAgent.includes('Mac')
const BLINK_INTERVAL = 600
const SYNC_TIMEOUT = 1000
const IMAGE_TIMEOUT = 10_000
const latin1 = new TextDecoder('latin1')
const decoder = new TextDecoder()

function parseColor(value: string): Color {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (!match) {
    throw new Error(`unsupported color ${value}`)
  }
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

async function closeWhenDecoded(decoding: Promise<ImageBitmap | null>) {
  try {
    const bitmap = await decoding
    bitmap?.close()
  } catch (error) {
    console.warn('could not decode image', error)
  }
}

export class Terminal {
  readonly element: HTMLDivElement
  cols = 80
  rows = 24
  private readonly canvas: HTMLCanvasElement
  private readonly input: HTMLTextAreaElement
  private readonly context: CanvasRenderingContext2D
  private readonly core: GhosttyCore
  private readonly scanner = new OutputScanner()
  private readonly handlers: TerminalHandlers
  private readonly observer: ResizeObserver
  private readonly prompt: Prompt
  private readonly search: Find
  private readonly images: InlineImages
  private readonly pointer: Pointer
  private readonly notifications = new KittyNotifications()
  private options: TerminalOptions
  private appearance: Appearance
  private metrics: Metrics
  private snapshot: Snapshot | null = null
  private sized = false
  private fitted = false
  private frame = 0
  private forceFull = true
  private renderFailed = false
  private cursorOn = true
  private cursorTimer: number | null = null
  private syncTimer: number | null = null
  private renderedCursorY: number | null = null
  private focused = false
  private composing = false
  private readonly suppressedKeys = new Set<string>()
  private readonly heldOptionKeys = new Set<string>()
  private backlog: Chunk[] = []
  private blocked = false
  private epoch = 0
  private title = ''
  private progress: Progress = { state: 0, value: 0 }
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
    const scrollbar = document.createElement('div')
    scrollbar.className =
      'absolute top-0 right-0 bottom-0 w-2 cursor-default touch-none'
    scrollbar.hidden = true
    const thumb = document.createElement('div')
    thumb.className =
      'bg-foreground/15 hover:bg-foreground/30 absolute inset-x-0.5 top-0 rounded-full'
    scrollbar.append(thumb)
    this.element.append(this.canvas, this.input, scrollbar)
    const context = this.canvas.getContext('2d', { alpha: false })
    if (!context) {
      throw new Error('canvas 2d is unavailable')
    }
    this.context = context
    this.appearance = this.appearanceFor(options)
    this.metrics = this.measure()
    this.core = new GhosttyCore(
      Math.max(1, Math.floor(window.innerWidth / this.metrics.width)),
      this.rows,
      options.scrollback,
      handlers.onReply,
      handlers.onBell
    )
    this.prompt = new Prompt(this.core)
    this.search = new Find(this.core, () => this.redraw())
    this.images = new InlineImages(this.core)
    this.pointer = new Pointer({
      canvas: this.canvas,
      scrollbar,
      thumb,
      core: this.core,
      view: () => ({
        cols: this.cols,
        rows: this.rows,
        metrics: this.metrics,
        snapshot: this.snapshot,
        clickToMoveCursor: this.options.clickToMoveCursor,
      }),
      focus: () => this.focus(),
      redraw: () => this.redraw(),
      scrollViewport: (delta) => this.scrollViewport(delta),
      moveCursorTo: (cell) => this.moveCursorTo(cell),
      onData: handlers.onData,
      onLink: handlers.onLink,
    })
    this.applyTerminalOptions()
    this.resizeCore()
    this.installEvents()
    this.observer = new ResizeObserver(() => this.fit())
    this.observer.observe(this.element)
  }

  setOptions(options: TerminalOptions) {
    this.options = options
    this.appearance = this.appearanceFor(options)
    this.metrics = this.measure()
    if (!options.clickToMoveCursor) {
      this.prompt.release()
    }
    this.applyTerminalOptions()
    this.resizeCore()
    this.forceFull = true
    this.fit()
    this.requestRender()
  }

  write(data: Uint8Array, replay: boolean) {
    if (this.disposed) {
      return
    }
    this.backlog.push({ data, replay })
    if (!this.blocked) {
      this.drain()
    }
  }

  reset() {
    this.epoch += 1
    this.backlog = []
    this.blocked = false
    this.scanner.reset()
    this.prompt.reset()
    this.core.reset()
    this.applyTerminalOptions()
    this.images.clear()
    this.core.clearSelection()
    this.redraw()
  }

  focus() {
    this.input.focus({ preventScroll: true })
  }

  isKittyKeyboard() {
    return this.core.isKittyKeyboard()
  }

  paste(text: string) {
    const data = this.core.encoder.encodePaste(text)
    if (data.length > 0) {
      this.sendInput(data)
    }
  }

  presize(cols: number, rows: number) {
    if (this.fitted || (cols === this.cols && rows === this.rows)) {
      return
    }
    this.cols = cols
    this.rows = rows
    this.resizeCore()
  }

  fit() {
    if (this.disposed) {
      return
    }
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
      this.metrics = this.measure()
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
    const top = this.viewportTop()
    const active = this.search.find(text, backwards, incremental, top)
    if (
      active !== null &&
      (active.row < top || active.row >= top + this.rows)
    ) {
      this.scrollViewport(active.row - top - Math.floor(this.rows / 2))
    }
    this.redraw()
  }

  onFindResults(listener: (results: FindResults) => void) {
    return this.search.onResults(listener)
  }

  clearFind() {
    this.search.clear()
    this.redraw()
  }

  replyClipboard(text: string, query: ClipboardQuery) {
    if (
      query.epoch !== this.epoch ||
      query.generation !== this.prompt.generation ||
      (query.atPrompt && this.prompt.shell !== 'prompt')
    ) {
      return
    }
    this.handlers.onReply(
      clipboardReply(text, query.selection, query.terminator)
    )
  }

  beforeInput(data: string) {
    this.prompt.beforeInput(data)
  }

  dispose() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.observer.disconnect()
    this.cancelRender()
    this.pointer.dispose()
    this.search.dispose()
    window.removeEventListener('focus', this.onWindowFocus)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.images.clear()
    this.prompt.release()
    this.core.dispose()
    this.element.remove()
  }

  private redraw() {
    this.forceFull = true
    this.requestRender()
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

  private measure() {
    return measureCell(
      this.context,
      this.options.fontSize,
      this.appearance.fontFamily,
      this.options.lineHeight,
      window.devicePixelRatio || 1
    )
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
      if (chunk) {
        this.process(chunk)
      }
    }
    const title = this.core.title()
    if (title !== this.title) {
      this.title = title
      this.handlers.onTitle(title)
    }
    this.search.outputChanged()
    this.cursorOn = true
    this.requestRender()
  }

  private process(chunk: Chunk) {
    const data = chunk.data
    const replay = chunk.replay
    this.core.setReplies(!replay)
    let start = 0
    const consumed = this.scanner.scan(data, (event, end) => {
      this.core.write(data.subarray(start, end))
      start = end
      return this.handleOutput(event, replay)
    })
    this.core.write(data.subarray(start, consumed))
    if (consumed < data.length) {
      this.backlog.unshift({ data: data.subarray(consumed), replay })
    }
  }

  private handleOutput(event: OutputEvent, replay: boolean) {
    if (event.type === 'sixel') {
      return this.decodeImage(decodeSixel(event.data))
    }
    const text = latin1.decode(event.data)
    if (text.startsWith('1337;File=')) {
      return this.decodeImage(
        decodeInlineImage(text.slice('1337;File='.length), {
          cellWidth: this.metrics.width,
          cellHeight: this.metrics.height,
          width: this.cols * this.metrics.width,
          height: this.rows * this.metrics.height,
          pixelRatio: window.devicePixelRatio || 1,
        })
      )
    }
    if (text.startsWith('133;') || text.startsWith('6973;')) {
      this.prompt.mark(text, this.options.clickToMoveCursor)
      return false
    }
    if (text.startsWith('52;')) {
      const parts = text.split(';')
      const payload = parts[2]
      if (replay || payload === undefined) {
        return false
      }
      if (payload === '?') {
        this.handlers.onClipboardRead({
          selection: xtermSelection(parts[1]),
          terminator: event.terminator,
          generation: this.prompt.generation,
          epoch: this.epoch,
          atPrompt: this.prompt.shell === 'prompt',
        })
        return false
      }
      const clipboard = clipboardText(payload)
      if (clipboard !== null) {
        this.handlers.onClipboard(clipboard)
      }
      return false
    }
    if (text === '10;?' || text === '11;?' || text === '12;?') {
      if (!replay) {
        this.handlers.onReply(
          colorReply(text, this.core.currentColors(), event.terminator)
        )
      }
      return false
    }
    if (text.startsWith('4;')) {
      if (!replay) {
        for (const reply of paletteReplies(
          text,
          this.core.currentColors().palette,
          event.terminator
        ))
          {this.handlers.onReply(reply)}
      }
      return false
    }
    if (text === '9;4' || text.startsWith('9;4;')) {
      const progress = nextProgress(text, this.progress)
      if (progress !== null) {
        this.progress = progress
        this.handlers.onProgress(progress)
      }
      return false
    }
    if (replay) {
      return false
    }
    const notification = text.startsWith('99;')
      ? this.notifications.add(decoder.decode(event.data))
      : textNotification(text, event.data)
    if (notification !== null) {
      this.handlers.onNotify(notification.title, notification.body)
    }
    return false
  }

  private decodeImage(decoding: Promise<ImageBitmap | null>) {
    this.blocked = true
    void this.placeImage(decoding, this.epoch, window.devicePixelRatio || 1)
    return true
  }

  private async placeImage(
    decoding: Promise<ImageBitmap | null>,
    epoch: number,
    pixelRatio: number
  ) {
    let timer = 0
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = window.setTimeout(() => resolve('timeout'), IMAGE_TIMEOUT)
    })
    try {
      const bitmap = await Promise.race([decoding, timeout])
      if (bitmap === 'timeout') {
        console.warn('image decoding took too long, skipping the image')
        void closeWhenDecoded(decoding)
      } else if (bitmap !== null) {
        if (epoch === this.epoch && !this.disposed) {
          this.images.place(bitmap, pixelRatio, this.metrics.height)
        } else {
          bitmap.close()
        }
      }
    } catch (error) {
      console.warn('could not decode image', error)
    }
    window.clearTimeout(timer)
    if (epoch !== this.epoch || this.disposed) {
      return
    }
    this.blocked = false
    this.drain()
  }

  private moveCursorTo(cell: Point) {
    if (!this.options.clickToMoveCursor) {
      return
    }
    const data = this.prompt.moveCursorInput(
      cell,
      this.snapshot,
      this.viewportTop()
    )
    if (data === null) {
      return
    }
    if (data !== '') {
      this.sendInput(data)
    }
    this.core.clearSelection()
    this.redraw()
  }

  private sendInput(data: string) {
    this.prompt.beforeInput(data)
    if (this.core.scrollbarState()?.offset !== this.maxOffset()) {
      this.core.scrollToBottom()
      this.redraw()
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

  private scrollViewport(delta: number) {
    const state = this.core.scrollbarState()
    let rows = Math.trunc(delta)
    if (state !== null) {
      const maxOffset = Math.max(0, state.total - state.len)
      rows =
        Math.max(0, Math.min(state.offset + rows, maxOffset)) - state.offset
    }
    if (rows === 0) {
      return
    }
    this.core.scroll(rows)
    this.redraw()
  }

  private requestRender() {
    if (this.disposed || !this.sized || this.frame !== 0) {
      return
    }
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.renderFrame()
    })
  }

  private cancelRender() {
    if (this.frame !== 0) {
      window.cancelAnimationFrame(this.frame)
    }
    this.frame = 0
    if (this.cursorTimer !== null) {
      window.clearTimeout(this.cursorTimer)
    }
    this.cursorTimer = null
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer)
    }
    this.syncTimer = null
  }

  private renderFrame() {
    if (this.disposed || !this.sized || !this.element.isConnected) {
      return
    }
    if (this.frame !== 0) {
      window.cancelAnimationFrame(this.frame)
    }
    this.frame = 0
    try {
      this.draw()
      this.renderFailed = false
    } catch (error) {
      if (!this.renderFailed) {
        console.error('could not draw the terminal', error)
      }
      this.renderFailed = true
    }
  }

  private draw() {
    if (this.core.isSynchronizedOutput()) {
      if (this.syncTimer === null) {
        this.syncTimer = window.setTimeout(() => {
          this.syncTimer = null
          this.core.endSynchronizedOutput()
          this.requestRender()
        }, SYNC_TIMEOUT)
      }
      return
    }
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer)
    }
    this.syncTimer = null
    const snapshot = this.core.snapshot()
    this.snapshot = snapshot
    const blinking =
      this.focused && snapshot.cursorBlinking && snapshot.cursorVisible
    if (!blinking) {
      this.cursorOn = true
    }
    const top = this.viewportTop()
    const images = this.images.visible(top, this.rows, this.metrics.height)
    const cell = this.core.cellSize()
    const kitty = this.core.kitty.images(snapshot.rowData, cell)
    render({
      context: this.context,
      snapshot,
      metrics: this.metrics,
      appearance: this.appearance,
      forceFull: this.forceFull || images.length > 0 || kitty.length > 0,
      cursorOn: this.cursorOn,
      previousCursorY: this.renderedCursorY,
      focused: this.focused,
      hoveredLink: this.pointer.hoveredLink?.range ?? null,
      highlights: this.search.highlights(snapshot, top),
      pixelRatio: window.devicePixelRatio || 1,
      drawLayer: (layer) =>
        drawKitty(this.context, kitty, layer, this.metrics, cell),
    })
    drawKitty(this.context, kitty, 'aboveText', this.metrics, cell)
    for (const image of images) {
      this.context.drawImage(
        image.bitmap,
        image.x * this.metrics.width,
        image.y * this.metrics.height,
        image.width,
        image.height
      )
    }
    this.forceFull = images.length > 0 || kitty.length > 0
    this.renderedCursorY =
      this.cursorOn && snapshot.cursorVisible && snapshot.cursorY >= 0
        ? snapshot.cursorY
        : null
    if (snapshot.cursorX >= 0 && snapshot.cursorY >= 0) {
      this.input.style.left = `${snapshot.cursorX * this.metrics.width}px`
      this.input.style.top = `${snapshot.cursorY * this.metrics.height}px`
    }
    this.pointer.updateScrollbar(this.element.clientHeight)
    if (this.cursorTimer !== null) {
      window.clearTimeout(this.cursorTimer)
    }
    this.cursorTimer = null
    if (blinking) {
      this.cursorTimer = window.setTimeout(() => {
        this.cursorTimer = null
        this.cursorOn = !this.cursorOn
        this.requestRender()
      }, BLINK_INTERVAL)
    }
  }

  private copySelection() {
    const text = this.core.selectionText()
    if (text.length === 0) {
      return
    }
    if (!window.isSecureContext) {
      console.warn('copy from the terminal needs https or localhost')
      return
    }
    void navigator.clipboard.writeText(text)
  }

  private optionIsMeta(event: KeyboardEvent) {
    if (!isMac || !event.altKey || event.metaKey) {
      return false
    }
    const mode = this.options.optionAsMeta
    if (mode === 'off') {
      return false
    }
    if (mode === 'both') {
      return true
    }
    if (mode === 'left') {
      return this.heldOptionKeys.has('AltLeft')
    }
    if (mode === 'right') {
      return this.heldOptionKeys.has('AltRight')
    }
    throw new Error(`unknown option as meta mode ${mode}`)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'AltLeft' || event.code === 'AltRight') {
      this.heldOptionKeys.add(event.code)
    }
    if (!this.handlers.beforeKey(event)) {
      this.suppressedKeys.add(event.code)
      return
    }
    const optionKey = this.optionIsMeta(event)
    const optionAsMeta = optionKey && this.core.encoder.metaText(event) !== null
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
    if (paste || (isMac && event.metaKey && key === 'q')) {
      this.suppressedKeys.add(event.code)
      return
    }
    const data = this.core.encoder.encodeKey(event, 'press', optionAsMeta)
    if (data.length === 0) {
      return
    }
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
    if (this.suppressedKeys.delete(event.code)) {
      return
    }
    if (event.isComposing || this.composing) {
      return
    }
    const data = this.core.encoder.encodeKey(
      event,
      'release',
      this.optionIsMeta(event)
    )
    if (data.length === 0) {
      return
    }
    event.preventDefault()
    this.handlers.onData(data)
  }

  private readonly onInput = (event: Event) => {
    const inputEvent = event as InputEvent
    if (this.composing || inputEvent.isComposing) {
      return
    }
    const data = this.input.value || inputEvent.data || ''
    this.input.value = ''
    if (data.length > 0) {
      this.sendInput(data)
    }
  }

  private readonly onCompositionStart = () => {
    this.composing = true
  }

  private readonly onCompositionEnd = (event: CompositionEvent) => {
    this.composing = false
    const data = this.input.value || event.data
    this.input.value = ''
    if (data.length > 0) {
      this.sendInput(data)
    }
  }

  private readonly onPaste = (event: ClipboardEvent) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (text.length > 0) {
      this.paste(text)
    }
  }

  private readonly onCopy = (event: ClipboardEvent) => {
    const text = this.core.selectionText()
    if (text.length === 0 || !event.clipboardData) {
      return
    }
    event.preventDefault()
    event.clipboardData.setData('text/plain', text)
  }

  private readonly onWindowFocus = () => {
    if (isMac && this.options.optionAsMeta !== 'off') {
      this.core.encoder.refreshKeyboardLayout()
    }
  }

  private readonly onContextRestored = () => {
    const ratio = window.devicePixelRatio || 1
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.redraw()
  }

  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return
    }
    this.redraw()
  }

  private readonly onFocus = () => {
    this.focused = true
    this.cursorOn = true
    this.requestRender()
    if (!this.disposed && this.core.isFocusReporting()) {
      this.handlers.onReply('\x1b[I')
    }
  }

  private readonly onBlur = () => {
    this.focused = false
    this.heldOptionKeys.clear()
    this.cursorOn = true
    this.requestRender()
    if (!this.disposed && this.core.isFocusReporting()) {
      this.handlers.onReply('\x1b[O')
    }
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
    this.canvas.addEventListener('contextrestored', this.onContextRestored)
    window.addEventListener('focus', this.onWindowFocus)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }
}
