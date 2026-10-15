import type { GhosttyCore } from './core'
import { rowCharacters, type Snapshot } from './render-state'
import type { Highlight } from './renderer'

export type FindResults = { resultIndex: number; resultCount: number }

type Match = { row: number; index: number }

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

export class Find {
  private readonly core: GhosttyCore
  private readonly redraw: () => void
  private readonly listeners = new Set<(results: FindResults) => void>()
  private query = ''
  private matches: Match[] = []
  private activeMatch = -1
  private stale = false
  private timer: number | null = null

  constructor(core: GhosttyCore, redraw: () => void) {
    this.core = core
    this.redraw = redraw
  }

  find(text: string, backwards: boolean, incremental: boolean, top: number) {
    const previous = this.matches[this.activeMatch] ?? null
    this.query = text
    this.refresh()
    if (this.matches.length === 0) {
      this.activeMatch = -1
    } else if (incremental || previous === null) {
      const from = previous?.row ?? top
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
    this.emit()
    return this.matches[this.activeMatch] ?? null
  }

  onResults(listener: (results: FindResults) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear() {
    this.query = ''
    this.matches = []
    this.activeMatch = -1
  }

  outputChanged() {
    if (this.query === '') return
    this.stale = true
    if (this.timer !== null) return
    this.timer = window.setTimeout(() => {
      this.timer = null
      if (!this.stale || this.query === '') return
      const active = this.matches[this.activeMatch]
      this.refresh()
      const index = active
        ? this.matches.findIndex(
            (match) => match.row === active.row && match.index === active.index
          )
        : -1
      this.activeMatch = index === -1 ? this.matches.length - 1 : index
      this.emit()
      this.redraw()
    }, 200)
  }

  highlights(snapshot: Snapshot, top: number) {
    if (this.query === '') return []
    const active = this.matches[this.activeMatch]
    const highlights: Highlight[] = []
    snapshot.rowData.forEach((row, y) => {
      const characters = rowCharacters(row, y)
      occurrences(characters.text, this.query).forEach((offset, index) => {
        const start = characters.points[offset]
        const end = characters.points[offset + this.query.length - 1]
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

  dispose() {
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
  }

  private refresh() {
    this.stale = false
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

  private emit() {
    const results = {
      resultIndex: this.activeMatch,
      resultCount: this.matches.length,
    }
    for (const listener of this.listeners) listener(results)
  }
}
