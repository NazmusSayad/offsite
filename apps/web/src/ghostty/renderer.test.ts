import { describe, expect, it } from 'vitest'
import type { Cell, Color } from './core'
import { render } from './renderer'

type Call = { name: string; args: number[]; fillStyle: string }

const background = { r: 0, g: 0, b: 0 }
const foreground = { r: 200, g: 200, b: 200 }

function cell(overrides: Partial<Cell>): Cell {
  return {
    text: 'A',
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
    ...overrides,
  }
}

function draw(
  rows: Cell[][],
  width: number,
  height: number,
  pixelRatio: number
) {
  const calls: Call[] = []
  const state: Record<string | symbol, unknown> = {
    fillStyle: '',
    canvas: { width: 1000, height: 1000 },
  }
  const context = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key]
      return (...args: number[]) => {
        calls.push({
          name: String(key),
          args,
          fillStyle: String(target.fillStyle),
        })
      }
    },
  })
  render({
    context: context as unknown as CanvasRenderingContext2D,
    snapshot: {
      cols: rows[0].length,
      rows: rows.length,
      foreground,
      background,
      cursor: foreground,
      cursorX: -1,
      cursorY: -1,
      cursorVisible: false,
      cursorBlinking: false,
      cursorStyle: 1,
      dirtyRows: new Set(rows.keys()),
      rowData: rows.map((cells) => ({
        cells,
        isWrapContinuation: false,
        wrapsToNext: false,
      })),
    },
    backdrop: null,
    metrics: { width, height, baseline: height - 4, faceWidth: width },
    appearance: {
      fontSize: 14,
      fontFamily: 'monospace',
      ligatures: false,
      cursorText: '#000000',
      selectionBackground: '#333333',
      selectionForeground: '#ffffff',
      matchBackground: '#444444',
      activeMatchBorder: '#555555',
    },
    forceFull: false,
    cursorOn: false,
    previousCursorY: null,
    focused: true,
    hoveredLink: null,
    highlights: [],
    pixelRatio,
    drawLayer: () => undefined,
  })
  return calls
}

function css(color: Color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function underlines(calls: Call[]) {
  return calls
    .filter((call) => call.name === 'fillRect' && call.args[1] >= 14)
    .map((call) => ({ rect: call.args, color: call.fillStyle }))
}

describe('render backgrounds', () => {
  it('puts background edges on whole device pixels at 125% zoom', () => {
    const colors = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
    ]
    function row() {
      return colors.map((color) => cell({ text: ' ', background: color }))
    }
    const calls = draw([row(), row()], 8.6, 18, 1.25)
    const rects = calls
      .filter(
        (call) =>
          call.name === 'fillRect' && colors.map(css).includes(call.fillStyle)
      )
      .map((call) => call.args.map((value) => value * 1.25))
    for (const rect of rects)
      for (const value of rect) expect(value).toBeCloseTo(Math.round(value), 9)
    for (const [index, rect] of rects.entries()) {
      const next = rects[index + 1]
      if (next === undefined || index === 2) continue
      expect(next[0]).toBeCloseTo(rect[0] + rect[2], 9)
    }
    expect(rects[3][1]).toBeCloseTo(rects[0][1] + rects[0][3], 9)
  })
})

describe('render underlines', () => {
  it('draws straight and double underlines', () => {
    expect(underlines(draw([[cell({ underline: 1 })]], 10, 18, 1))).toEqual([
      { rect: [0, 16, 10, 1], color: css(foreground) },
    ])
    expect(underlines(draw([[cell({ underline: 2 })]], 10, 18, 1))).toEqual([
      { rect: [0, 16, 10, 1], color: css(foreground) },
      { rect: [0, 14, 10, 1], color: css(foreground) },
    ])
  })

  it('draws a curly underline as a wave', () => {
    const calls = draw([[cell({ underline: 3 })]], 10, 18, 1)
    expect(calls.filter((call) => call.name === 'stroke')).toHaveLength(1)
    const ys = calls
      .filter((call) => call.name === 'lineTo')
      .map((call) => call.args[1])
    expect(Math.min(...ys)).toBeLessThan(15)
    expect(Math.max(...ys)).toBeGreaterThan(15)
  })

  it('draws dotted and dashed underlines', () => {
    expect(
      underlines(draw([[cell({ underline: 4 })]], 10, 18, 1)).map(
        (call) => call.rect
      )
    ).toEqual([0, 2, 4, 6, 8].map((x) => [x, 16, 1, 1]))
    expect(
      underlines(draw([[cell({ underline: 5 })]], 10, 18, 1)).map(
        (call) => call.rect
      )
    ).toEqual([
      [0, 16, 3, 1],
      [5, 16, 3, 1],
    ])
  })

  it('uses the underline color only for the underline', () => {
    const red = { r: 255, g: 0, b: 0 }
    const calls = draw(
      [[cell({ underline: 1, underlineColor: red, strikethrough: true })]],
      10,
      18,
      1
    )
    expect(
      calls
        .filter((call) => call.name === 'fillRect' && call.args[3] === 1)
        .map((call) => ({ y: call.args[1], color: call.fillStyle }))
    ).toEqual([
      { y: 9, color: css(foreground) },
      { y: 16, color: css(red) },
    ])
  })

  it('draws no underline for strikethrough only', () => {
    expect(
      underlines(draw([[cell({ strikethrough: true })]], 10, 18, 1))
    ).toEqual([])
  })

  it('rejects an unknown underline style', () => {
    expect(() => draw([[cell({ underline: 9 })]], 10, 18, 1)).toThrow(
      'unknown underline style 9'
    )
  })
})
