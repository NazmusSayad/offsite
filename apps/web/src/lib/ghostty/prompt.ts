import type { GhosttyCore, Point } from './core'
import { CELL_WIDE, type Snapshot } from './render-state'

const COMMAND_ENDINGS = [
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
]

function isBefore(point: Point, other: Point) {
  return point.y < other.y || (point.y === other.y && point.x < other.x)
}

export class Prompt {
  shell: 'unknown' | 'prompt' | 'command' = 'unknown'
  generation = 0
  private readonly core: GhosttyCore
  private native = false
  private input = false
  private clickEvents = false
  private inputRef: number | null = null

  constructor(core: GhosttyCore) {
    this.core = core
  }

  mark(text: string, trackInput: boolean) {
    const native = text.startsWith('133;')
    const start = native ? 4 : 5
    if (text.length > start + 1 && text[start + 1] !== ';') {return}
    const kind = text.charAt(start)
    if (this.core.isAlternateScreen()) {return}
    if (kind === 'A') {
      const parts = text.split(';')
      if (parts.includes('k=s') || parts.includes('k=c')) {return}
      const clickEvents = native && parts.includes('click_events=1')
      const repaint = this.shell === 'prompt'
      const duplicate = repaint && !this.input && this.native !== native
      this.shell = 'prompt'
      this.native = native
      if (trackInput) {this.trackInput()}
      if (duplicate) {
        this.clickEvents = this.clickEvents || clickEvents
        return
      }
      this.input = false
      this.clickEvents = clickEvents
      if (repaint) {return}
      this.generation += 1
      return
    }
    if (kind === 'B') {
      this.shell = 'prompt'
      this.input = true
      if (trackInput) {this.trackInput()}
      return
    }
    if (kind === 'C') {
      this.shell = 'command'
      return
    }
    if (kind === 'D') {
      if (this.shell === 'prompt' && !this.input) {return}
      this.shell = 'unknown'
    }
  }

  beforeInput(data: string) {
    if (
      this.shell === 'prompt' &&
      COMMAND_ENDINGS.some((sequence) => data.includes(sequence))
    )
      {this.shell = 'unknown'}
  }

  reset() {
    this.release()
    this.shell = 'unknown'
    this.input = false
    this.clickEvents = false
  }

  release() {
    if (this.inputRef !== null) {this.core.untrack(this.inputRef)}
    this.inputRef = null
  }

  moveCursorInput(cell: Point, snapshot: Snapshot | null, top: number) {
    if (
      this.shell !== 'prompt' ||
      this.inputRef === null ||
      snapshot === null ||
      snapshot.cursorX < 0 ||
      snapshot.cursorY < 0 ||
      this.core.isAlternateScreen() ||
      this.core.isMouseTracking()
    )
      {return null}
    const input = this.core.trackedPoint(this.inputRef)
    if (input === null) {return null}
    const start = { x: input.x, y: input.y - top }
    if (isBefore(cell, start)) {return null}
    if (this.clickEvents) {
      const state = this.core.scrollbarState()
      if (state === null) {return null}
      const y = cell.y + top - (state.total - state.len)
      if (y < 0) {return null}
      return `\x1b[<0;${cell.x + 1};${y + 1}M`
    }
    if (!this.input) {return null}
    const target = { x: cell.x, y: cell.y }
    if (
      target.x > 0 &&
      snapshot.rowData[target.y]?.cells[target.x]?.wide === CELL_WIDE.spacerTail
    )
      {target.x -= 1}
    const cursor = { x: snapshot.cursorX, y: snapshot.cursorY }
    if (isBefore(target, start) || isBefore(cursor, start)) {return null}
    const left = isBefore(target, cursor)
    const from = left ? target : cursor
    const to = left ? cursor : target
    let count = 0
    for (let y = from.y; y <= to.y; y += 1) {
      const row = snapshot.rowData[y]
      if (row === undefined) {return null}
      const last = y === to.y ? to.x : row.cells.length
      for (let x = y === from.y ? from.x : 0; x < last; x += 1)
        {if (row.cells[x].text !== '') count += 1}
      if (y < to.y && !row.wrapsToNext) {
        if (left) {return null}
        break
      }
    }
    const key = left ? 'ArrowLeft' : 'ArrowRight'
    const data = this.core.encoder.encodeKey(
      new KeyboardEvent('keydown', { key, code: key })
    )
    return count > 0 ? data.repeat(count) : ''
  }

  private trackInput() {
    if (this.inputRef === null) {this.inputRef = this.core.trackCursor()}
    else {this.core.retrack(this.inputRef)}
  }
}
