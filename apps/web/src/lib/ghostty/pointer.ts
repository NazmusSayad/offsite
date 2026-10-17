import type { GhosttyCore, Point, Scrollbar } from './core'
import { IMAGE_MARKER } from './images'
import { rowCharacters, type Snapshot } from './render-state'
import { inRange, type Metrics, type Range } from './renderer'

type Link = { uri: string; range: Range }

export type PointerContext = {
  canvas: HTMLCanvasElement
  scrollbar: HTMLDivElement
  thumb: HTMLDivElement
  core: GhosttyCore
  view: () => {
    cols: number
    rows: number
    metrics: Metrics
    snapshot: Snapshot | null
    clickToMoveCursor: boolean
  }
  focus: () => void
  redraw: () => void
  scrollViewport: (delta: number) => void
  moveCursorTo: (cell: Point) => void
  onData: (data: string) => void
  onLink: (uri: string, event: MouseEvent) => void
}

const isMac = navigator.userAgent.includes('Mac')
const MULTI_CLICK_INTERVAL = 500
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/g

function mouseButton(button: number) {
  if (button === 0) {
    return 1
  }
  if (button === 1) {
    return 3
  }
  if (button === 2) {
    return 2
  }
  return null
}

function scrollbarGeometry(state: Scrollbar, height: number) {
  const maxOffset = Math.max(0, state.total - state.len)
  if (height <= 0 || state.len <= 0 || maxOffset === 0) {
    return null
  }
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

export class Pointer {
  hoveredLink: Link | null = null
  private readonly context: PointerContext
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
  private clickMove: Point | null = null
  private clicks = { count: 0, time: 0, x: 0, y: 0 }
  private touch: { id: number; y: number; moved: boolean } | null = null
  private wheelRemainder = 0
  private scrollbarDrag: { id: number; offset: number } | null = null

  constructor(context: PointerContext) {
    this.context = context
    const canvas = context.canvas
    const scrollbar = context.scrollbar
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('mousedown', this.onMouseDown)
    scrollbar.addEventListener('pointerdown', this.onScrollbarDown)
    scrollbar.addEventListener('pointermove', this.onScrollbarMove)
    scrollbar.addEventListener('pointerup', this.onScrollbarUp)
    scrollbar.addEventListener('pointercancel', this.onScrollbarUp)
  }

  updateScrollbar(height: number) {
    const state = this.context.core.scrollbarState()
    const geometry = state === null ? null : scrollbarGeometry(state, height)
    this.context.scrollbar.hidden = geometry === null
    if (geometry === null) {
      return
    }
    this.context.thumb.style.height = `${geometry.thumbHeight}px`
    this.context.thumb.style.transform = `translateY(${geometry.thumbTop}px)`
  }

  dispose() {
    this.setSelectionScroll(0)
  }

  private scrollRows(pixels: number, event: MouseEvent) {
    const core = this.context.core
    const total =
      this.wheelRemainder + pixels / this.context.view().metrics.height
    const rows = Math.trunc(total)
    this.wheelRemainder = total - rows
    if (rows === 0) {
      return
    }
    if (this.reportsMouse(event)) {
      for (let index = 0; index < Math.abs(rows); index += 1) {
        this.sendMouse('press', rows < 0 ? 4 : 5, event)
      }
      return
    }
    if (core.isAlternateScreen()) {
      const application = core.isApplicationCursorKeys()
      const sequence =
        (application ? '\x1bO' : '\x1b[') + (rows < 0 ? 'A' : 'B')
      this.context.onData(sequence.repeat(Math.abs(rows)))
      return
    }
    this.context.scrollViewport(rows)
  }

  private cellAt(clientX: number, clientY: number): Point {
    const view = this.context.view()
    const bounds = this.context.canvas.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(
          view.cols - 1,
          Math.floor((clientX - bounds.left) / view.metrics.width)
        )
      ),
      y: Math.max(
        0,
        Math.min(
          view.rows - 1,
          Math.floor((clientY - bounds.top) / view.metrics.height)
        )
      ),
    }
  }

  private reportsMouse(event: MouseEvent) {
    return (
      this.context.core.isMouseTracking() &&
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
    const view = this.context.view()
    const bounds = this.context.canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const data = this.context.core.encoder.encodeMouse({
      action,
      button,
      mods:
        (event.shiftKey ? 1 : 0) |
        (event.ctrlKey ? 1 << 1 : 0) |
        (event.altKey ? 1 << 2 : 0) |
        (event.metaKey ? 1 << 3 : 0),
      x: Math.max(0, event.clientX - bounds.left) * ratio,
      y: Math.max(0, event.clientY - bounds.top) * ratio,
      screenWidth: view.cols * view.metrics.width * ratio,
      screenHeight: view.rows * view.metrics.height * ratio,
      cellWidth: view.metrics.width * ratio,
      cellHeight: view.metrics.height * ratio,
      anyButtonPressed: event.buttons !== 0,
    })
    if (data.length === 0) {
      return
    }
    if (action === 'motion') {
      if (data === this.lastMotion) {
        return
      }
      this.lastMotion = data
    } else {
      this.lastMotion = ''
    }
    this.context.onData(data)
  }

  private linkAt(clientX: number, clientY: number): Link | null {
    const view = this.context.view()
    const core = this.context.core
    const snapshot = view.snapshot
    if (!snapshot) {
      return null
    }
    const bounds = this.context.canvas.getBoundingClientRect()
    const gridX = clientX - bounds.left
    const gridY = clientY - bounds.top
    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX >= view.cols * view.metrics.width ||
      gridY >= view.rows * view.metrics.height
    ) {
      return null
    }
    const cell = {
      x: Math.floor(gridX / view.metrics.width),
      y: Math.floor(gridY / view.metrics.height),
    }
    const explicit = core.hyperlinkAt(cell.x, cell.y)
    if (explicit !== null) {
      if (explicit.startsWith(IMAGE_MARKER)) {
        return null
      }
      let start = cell.x
      let end = cell.x
      while (start > 0 && core.hyperlinkAt(start - 1, cell.y) === explicit) {
        start -= 1
      }
      while (
        end < view.cols - 1 &&
        core.hyperlinkAt(end + 1, cell.y) === explicit
      ) {
        end += 1
      }
      return {
        uri: explicit,
        range: { start: { x: start, y: cell.y }, end: { x: end, y: cell.y } },
      }
    }
    let first = cell.y
    while (first > 0 && snapshot.rowData[first]?.isWrapContinuation) {
      first -= 1
    }
    let last = cell.y
    while (last < snapshot.rows - 1 && snapshot.rowData[last]?.wrapsToNext) {
      last += 1
    }
    let text = ''
    const points: Point[] = []
    for (let y = first; y <= last; y += 1) {
      const row = snapshot.rowData[y]
      if (!row) {
        break
      }
      const characters = rowCharacters(row, y)
      text += characters.text
      points.push(...characters.points)
    }
    for (const match of text.matchAll(URL_PATTERN)) {
      const uri = match[0].replace(/[.,;:!?)\]}'"]+$/, '')
      const startPoint = points[match.index]
      const endPoint = points[match.index + uri.length - 1]
      if (!startPoint || !endPoint) {
        continue
      }
      const range = { start: startPoint, end: endPoint }
      if (inRange(range, cell.y, cell.x)) {
        return { uri, range }
      }
    }
    return null
  }

  private setHoveredLink(link: Link | null) {
    const previous = this.hoveredLink
    this.context.canvas.style.cursor = link ? 'pointer' : ''
    if (
      previous?.uri === link?.uri &&
      previous?.range.start.x === link?.range.start.x &&
      previous?.range.start.y === link?.range.start.y
    ) {
      return
    }
    this.hoveredLink = link
    this.context.redraw()
  }

  private beginSelection(event: PointerEvent, count: number) {
    const core = this.context.core
    const cell = this.cellAt(event.clientX, event.clientY)
    const screen = core.toScreen(cell)
    if (!screen) {
      return
    }
    this.selectionMoved = false
    this.selectionMode = count >= 3 ? 'line' : count === 2 ? 'word' : 'cell'
    const range =
      this.selectionMode === 'line'
        ? core.selectLine(screen)
        : this.selectionMode === 'word'
          ? core.selectWord(screen)
          : null
    this.selectionAnchor = range ? range.start : screen
    this.selectionBase = range
    if (range) {
      core.setSelection(range.start, range.end)
    } else {
      this.selectionMode = 'cell'
      core.setSelection(screen, screen)
    }
    this.context.redraw()
  }

  private extendSelection(clientX: number, clientY: number) {
    const core = this.context.core
    const anchor = this.selectionAnchor
    if (!anchor) {
      return
    }
    const cell = this.cellAt(clientX, clientY)
    const screen = core.toScreen(cell)
    if (!screen) {
      return
    }
    this.selectionMoved = true
    const base = this.selectionBase
    if (base === null) {
      core.setSelection(anchor, screen)
    } else {
      const range =
        this.selectionMode === 'line'
          ? core.selectLine(screen)
          : core.selectWord(screen)
      const before =
        screen.y < base.start.y ||
        (screen.y === base.start.y && screen.x < base.start.x)
      core.setSelection(
        before ? base.end : base.start,
        range ? (before ? range.start : range.end) : screen
      )
    }
    this.context.redraw()
  }

  private setSelectionScroll(delta: number) {
    this.selectionScrollDelta = delta
    if (delta === 0) {
      if (this.selectionScroll !== null) {
        window.clearInterval(this.selectionScroll)
      }
      this.selectionScroll = null
      return
    }
    if (this.selectionScroll !== null) {
      return
    }
    this.selectionScroll = window.setInterval(() => {
      this.context.scrollViewport(this.selectionScrollDelta)
      const client = this.selectionClient
      if (client) {
        this.extendSelection(client.x, client.y)
      }
    }, 80)
  }

  private dragScrollbar(clientY: number) {
    const state = this.context.core.scrollbarState()
    const drag = this.scrollbarDrag
    if (state === null || drag === null) {
      return
    }
    const bounds = this.context.scrollbar.getBoundingClientRect()
    const geometry = scrollbarGeometry(state, bounds.height)
    if (geometry === null || geometry.travel === 0) {
      return
    }
    const top = Math.max(
      0,
      Math.min(clientY - bounds.top - drag.offset, geometry.travel)
    )
    const offset = Math.round((top / geometry.travel) * geometry.maxOffset)
    this.context.scrollViewport(offset - state.offset)
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    const canvas = this.context.canvas
    this.context.focus()
    if (event.pointerType === 'touch') {
      this.touch = { id: event.pointerId, y: event.clientY, moved: false }
      canvas.setPointerCapture(event.pointerId)
      return
    }
    if (this.reportsMouse(event)) {
      const button = mouseButton(event.button)
      if (button === null) {
        return
      }
      event.preventDefault()
      this.mousePointer = event.pointerId
      this.mouseButton = button
      this.sendMouse('press', button, event)
      canvas.setPointerCapture(event.pointerId)
      return
    }
    if (event.button !== 0) {
      return
    }
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
      this.context.view().clickToMoveCursor &&
      this.clicks.count === 1
        ? this.cellAt(event.clientX, event.clientY)
        : null
    this.selectionPointer = event.pointerId
    this.beginSelection(event, this.clicks.count)
    canvas.setPointerCapture(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const touch = this.touch
    if (touch?.id === event.pointerId) {
      const delta = touch.y - event.clientY
      if (Math.abs(delta) < 1) {
        return
      }
      touch.y = event.clientY
      touch.moved = true
      this.scrollRows(delta, event)
      return
    }
    if (
      this.mousePointer === event.pointerId ||
      (this.context.core.isMouseAnyEventTracking() && this.reportsMouse(event))
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
      ) {
        this.clickMove = null
      }
      this.selectionClient = { x: event.clientX, y: event.clientY }
      const bounds = this.context.canvas.getBoundingClientRect()
      this.setSelectionScroll(
        event.clientY < bounds.top ? -1 : event.clientY > bounds.bottom ? 1 : 0
      )
      this.extendSelection(event.clientX, event.clientY)
      return
    }
    this.setHoveredLink(this.linkAt(event.clientX, event.clientY))
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    const canvas = this.context.canvas
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    if (this.touch?.id === event.pointerId) {
      this.touch = null
      return
    }
    if (this.linkPointer === event.pointerId) {
      this.linkPointer = null
      const link = this.linkAt(event.clientX, event.clientY)
      if (link && event.type === 'pointerup') {
        this.context.onLink(link.uri, event)
      }
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
        this.context.core.clearSelection()
        this.selectionAnchor = null
        this.context.redraw()
      }
      const cell = this.clickMove
      this.clickMove = null
      if (cell !== null && event.type === 'pointerup') {
        this.context.moveCursorTo(cell)
      }
    }
  }

  private readonly onPointerLeave = () => {
    this.lastMotion = ''
    this.setHoveredLink(null)
  }

  private readonly onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) {
      return
    }
    event.preventDefault()
    const view = this.context.view()
    const pixels =
      event.deltaMode === 1
        ? event.deltaY * view.metrics.height
        : event.deltaMode === 2
          ? event.deltaY * view.rows * view.metrics.height
          : event.deltaY
    this.scrollRows(pixels, event)
  }

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      event.preventDefault()
    }
    this.context.focus()
  }

  private readonly onScrollbarDown = (event: PointerEvent) => {
    const state = this.context.core.scrollbarState()
    if (event.button !== 0 || state === null) {
      return
    }
    const scrollbar = this.context.scrollbar
    const bounds = scrollbar.getBoundingClientRect()
    const geometry = scrollbarGeometry(state, bounds.height)
    if (geometry === null) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this.scrollbarDrag = {
      id: event.pointerId,
      offset:
        event.target === this.context.thumb
          ? event.clientY - bounds.top - geometry.thumbTop
          : geometry.thumbHeight / 2,
    }
    scrollbar.setPointerCapture(event.pointerId)
    this.dragScrollbar(event.clientY)
  }

  private readonly onScrollbarMove = (event: PointerEvent) => {
    if (this.scrollbarDrag?.id !== event.pointerId) {
      return
    }
    event.preventDefault()
    this.dragScrollbar(event.clientY)
  }

  private readonly onScrollbarUp = (event: PointerEvent) => {
    if (this.scrollbarDrag?.id !== event.pointerId) {
      return
    }
    this.scrollbarDrag = null
    const scrollbar = this.context.scrollbar
    if (scrollbar.hasPointerCapture(event.pointerId)) {
      scrollbar.releasePointerCapture(event.pointerId)
    }
  }
}
