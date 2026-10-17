import { describe, expect, it, vi } from 'vitest'
import { drawGlyph } from './glyphs'

function paint(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void
) {
  const grid = Array.from({ length: height }, () => Array(width).fill('.'))
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      if (![x, y, w, h].every(Number.isInteger))
        throw new Error(`rect is not on whole pixels: ${[x, y, w, h]}`)
      for (let row = y; row < y + h; row += 1)
        for (let column = x; column < x + w; column += 1) {
          if (grid[row]?.[column] === undefined)
            throw new Error(`rect is outside the grid: ${[x, y, w, h]}`)
          grid[row][column] = '#'
        }
    },
  }
  draw(context as unknown as CanvasRenderingContext2D)
  return grid.map((row) => row.join(''))
}

function glyph(text: string) {
  return paint(7, 10, (context) =>
    drawGlyph(context, text, { left: 0, top: 0, width: 7, height: 10 }, 1)
  )
}

describe('drawGlyph', () => {
  it('draws a double horizontal line', () => {
    expect(glyph('═')).toEqual([
      '.......',
      '.......',
      '.......',
      '#######',
      '.......',
      '#######',
      '.......',
      '.......',
      '.......',
      '.......',
    ])
  })

  it('draws a double cross with open corners', () => {
    expect(glyph('╬')).toEqual([
      '..#.#..',
      '..#.#..',
      '..#.#..',
      '###.###',
      '.......',
      '###.###',
      '..#.#..',
      '..#.#..',
      '..#.#..',
      '..#.#..',
    ])
  })

  it('joins a light line to a double line', () => {
    expect(glyph('╤')).toEqual([
      '.......',
      '.......',
      '.......',
      '#######',
      '.......',
      '#######',
      '...#...',
      '...#...',
      '...#...',
      '...#...',
    ])
    expect(glyph('╓')).toEqual([
      '.......',
      '.......',
      '.......',
      '.......',
      '..#####',
      '..#.#..',
      '..#.#..',
      '..#.#..',
      '..#.#..',
      '..#.#..',
    ])
  })

  it('draws a heavy cross', () => {
    expect(glyph('╋')).toEqual([
      '..##...',
      '..##...',
      '..##...',
      '..##...',
      '#######',
      '#######',
      '..##...',
      '..##...',
      '..##...',
      '..##...',
    ])
  })

  it('draws lines without gaps between cells at 125% zoom', () => {
    const grid = paint(33, 23, (context) => {
      for (let column = 0; column < 3; column += 1)
        drawGlyph(
          context,
          '─',
          { left: column * 8.6, top: 0, width: 8.6, height: 18 },
          1.25
        )
    })
    expect(grid.filter((row) => row.includes('#'))).toEqual([
      '################################.',
    ])
  })
})
