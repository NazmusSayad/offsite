import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GhosttyCore } from './core'
import { loadTestGhostty } from './test-runtime'

const colors = {
  foreground: { r: 171, g: 178, b: 191 },
  background: { r: 28, g: 32, b: 37 },
  cursor: { r: 255, g: 255, b: 255 },
  palette: Array.from({ length: 16 }, (_, index) => ({
    r: index,
    g: index,
    b: index,
  })),
}

function terminal(output: string) {
  const core = new GhosttyCore(20, 2, 100, vi.fn(), vi.fn())
  core.setColors(colors)
  core.write(new TextEncoder().encode(output))
  return core
}

describe('GhosttyCore', () => {
  beforeAll(loadTestGhostty)

  it('reads each underline style', () => {
    const core = terminal(
      '\x1b[4:1mA\x1b[4:2mB\x1b[4:3mC\x1b[4:4mD\x1b[4:5mE\x1b[0mF'
    )
    const cells = core.snapshot().rowData[0].cells.slice(0, 6)
    expect(cells.map((cell) => cell.underline)).toEqual([1, 2, 3, 4, 5, 0])
    core.dispose()
  })

  it('reads RGB and palette underline colors', () => {
    const core = terminal(
      '\x1b[4;58:2::255:80:80mA\x1b[58:5:33mB\x1b[59mC\x1b[0m'
    )
    const cells = core.snapshot().rowData[0].cells.slice(0, 3)
    expect(cells.map((cell) => cell.underlineColor)).toEqual([
      { r: 255, g: 80, b: 80 },
      { r: 0, g: 135, b: 255 },
      null,
    ])
    core.dispose()
  })

  it('reports the theme colors and the colors that a program sets', () => {
    const core = terminal('')
    expect(core.currentColors().foreground).toEqual(colors.foreground)
    expect(core.currentColors().background).toEqual(colors.background)
    expect(core.currentColors().cursor).toEqual(colors.cursor)
    expect(core.currentColors().palette[1]).toEqual(colors.palette[1])
    expect(core.currentColors().palette[33]).toEqual({ r: 0, g: 135, b: 255 })
    core.write(
      new TextEncoder().encode(
        '\x1b]11;#102030\x07\x1b]12;#405060\x07\x1b]4;1;#ff0000\x07'
      )
    )
    expect(core.currentColors().background).toEqual({ r: 16, g: 32, b: 48 })
    expect(core.currentColors().cursor).toEqual({ r: 64, g: 80, b: 96 })
    expect(core.currentColors().palette[1]).toEqual({ r: 255, g: 0, b: 0 })
    core.dispose()
  })

  it('reports whether focus events are on', () => {
    const core = terminal('')
    expect(core.isFocusReporting()).toBe(false)
    core.write(new TextEncoder().encode('\x1b[?1004h'))
    expect(core.isFocusReporting()).toBe(true)
    core.write(new TextEncoder().encode('\x1b[?1004l'))
    expect(core.isFocusReporting()).toBe(false)
    core.dispose()
  })
})
