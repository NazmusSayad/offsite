import type { Row } from './core'

export const PLACEHOLDER = 0x10eeee

export type Placeholder = {
  imageId: number
  placementId: number
  row: number | null
  column: number | null
  imageIdHigh: number | null
}

export type PlaceholderRun = {
  x: number
  y: number
  imageId: number
  placementId: number
  row: number
  column: number
  width: number
}

type Size = { width: number; height: number }

const DIACRITICS = [
  0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346,
  0x034a, 0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363,
  0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c,
  0x036d, 0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592,
  0x0593, 0x0594, 0x0595, 0x0597, 0x0598, 0x0599, 0x059c, 0x059d, 0x059e,
  0x059f, 0x05a0, 0x05a1, 0x05a8, 0x05a9, 0x05ab, 0x05ac, 0x05af, 0x05c4,
  0x0610, 0x0611, 0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657,
  0x0658, 0x0659, 0x065a, 0x065b, 0x065d, 0x065e, 0x06d6, 0x06d7, 0x06d8,
  0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e4,
  0x06e7, 0x06e8, 0x06eb, 0x06ec, 0x0730, 0x0732, 0x0733, 0x0735, 0x0736,
  0x073a, 0x073d, 0x073f, 0x0740, 0x0741, 0x0743, 0x0745, 0x0747, 0x0749,
  0x074a, 0x07eb, 0x07ec, 0x07ed, 0x07ee, 0x07ef, 0x07f0, 0x07f1, 0x07f3,
  0x0816, 0x0817, 0x0818, 0x0819, 0x081b, 0x081c, 0x081d, 0x081e, 0x081f,
  0x0820, 0x0821, 0x0822, 0x0823, 0x0825, 0x0826, 0x0827, 0x0829, 0x082a,
  0x082b, 0x082c, 0x082d, 0x0951, 0x0953, 0x0954, 0x0f82, 0x0f83, 0x0f86,
  0x0f87, 0x135d, 0x135e, 0x135f, 0x17dd, 0x193a, 0x1a17, 0x1a75, 0x1a76,
  0x1a77, 0x1a78, 0x1a79, 0x1a7a, 0x1a7b, 0x1a7c, 0x1b6b, 0x1b6d, 0x1b6e,
  0x1b6f, 0x1b70, 0x1b71, 0x1b72, 0x1b73, 0x1cd0, 0x1cd1, 0x1cd2, 0x1cda,
  0x1cdb, 0x1ce0, 0x1dc0, 0x1dc1, 0x1dc3, 0x1dc4, 0x1dc5, 0x1dc6, 0x1dc7,
  0x1dc8, 0x1dc9, 0x1dcb, 0x1dcc, 0x1dd1, 0x1dd2, 0x1dd3, 0x1dd4, 0x1dd5,
  0x1dd6, 0x1dd7, 0x1dd8, 0x1dd9, 0x1dda, 0x1ddb, 0x1ddc, 0x1ddd, 0x1dde,
  0x1ddf, 0x1de0, 0x1de1, 0x1de2, 0x1de3, 0x1de4, 0x1de5, 0x1de6, 0x1dfe,
  0x20d0, 0x20d1, 0x20d4, 0x20d5, 0x20d6, 0x20d7, 0x20db, 0x20dc, 0x20e1,
  0x20e7, 0x20e9, 0x20f0, 0x2cef, 0x2cf0, 0x2cf1, 0x2de0, 0x2de1, 0x2de2,
  0x2de3, 0x2de4, 0x2de5, 0x2de6, 0x2de7, 0x2de8, 0x2de9, 0x2dea, 0x2deb,
  0x2dec, 0x2ded, 0x2dee, 0x2def, 0x2df0, 0x2df1, 0x2df2, 0x2df3, 0x2df4,
  0x2df5, 0x2df6, 0x2df7, 0x2df8, 0x2df9, 0x2dfa, 0x2dfb, 0x2dfc, 0x2dfd,
  0x2dfe, 0x2dff, 0xa66f, 0xa67c, 0xa67d, 0xa6f0, 0xa6f1, 0xa8e0, 0xa8e1,
  0xa8e2, 0xa8e3, 0xa8e4, 0xa8e5, 0xa8e6, 0xa8e7, 0xa8e8, 0xa8e9, 0xa8ea,
  0xa8eb, 0xa8ec, 0xa8ed, 0xa8ee, 0xa8ef, 0xa8f0, 0xa8f1, 0xaab0, 0xaab2,
  0xaab3, 0xaab7, 0xaab8, 0xaabe, 0xaabf, 0xaac1, 0xfe20, 0xfe21, 0xfe22,
  0xfe23, 0xfe24, 0xfe25, 0xfe26, 0x10a0f, 0x10a38, 0x1d185, 0x1d186, 0x1d187,
  0x1d188, 0x1d189, 0x1d1aa, 0x1d1ab, 0x1d1ac, 0x1d1ad, 0x1d242, 0x1d243,
  0x1d244,
]

const DIACRITIC_INDEX = new Map(
  DIACRITICS.map((codepoint, index) => [codepoint, index])
)

export function readPlaceholder(
  text: string,
  imageId: number,
  placementId: number
): Placeholder {
  const indexes = Array.from(text)
    .slice(1, 4)
    .map((char) => DIACRITIC_INDEX.get(char.codePointAt(0) ?? 0) ?? null)
  const high = indexes[2] ?? null
  return {
    imageId,
    placementId,
    row: indexes[0] ?? null,
    column: indexes[1] ?? null,
    imageIdHigh: high !== null && high < 256 ? high : null,
  }
}

export function placeholderRuns(rows: Row[]) {
  const runs: PlaceholderRun[] = []
  for (let y = 0; y < rows.length; y += 1) {
    const cells = rows[y].cells
    let run: (PlaceholderRun & { imageIdHigh: number | null }) | null = null
    for (let x = 0; x < cells.length; x += 1) {
      const placeholder = cells[x].placeholder
      if (
        run !== null &&
        placeholder !== null &&
        placeholder.imageId === run.imageId &&
        placeholder.placementId === run.placementId &&
        (placeholder.row === null || placeholder.row === run.row) &&
        (placeholder.column === null ||
          placeholder.column === run.column + run.width) &&
        (placeholder.imageIdHigh === null ||
          placeholder.imageIdHigh === run.imageIdHigh)
      ) {
        run.width += 1
        continue
      }
      if (run !== null) runs.push(completeRun(run))
      run =
        placeholder === null
          ? null
          : {
              x,
              y,
              imageId: placeholder.imageId,
              imageIdHigh: placeholder.imageIdHigh,
              placementId: placeholder.placementId,
              row: placeholder.row ?? 0,
              column: placeholder.column ?? 0,
              width: 1,
            }
    }
    if (run !== null) runs.push(completeRun(run))
  }
  return runs
}

function completeRun(
  run: PlaceholderRun & { imageIdHigh: number | null }
): PlaceholderRun {
  return {
    x: run.x,
    y: run.y,
    imageId: run.imageId + (run.imageIdHigh ?? 0) * 2 ** 24,
    placementId: run.placementId,
    row: run.row,
    column: run.column,
    width: run.width,
  }
}

export function placeholderSlice(
  run: PlaceholderRun,
  grid: { columns: number; rows: number },
  image: Size,
  cell: Size
) {
  const columns =
    grid.columns === 0 ? Math.ceil(image.width / cell.width) : grid.columns
  const rows =
    grid.rows === 0 ? Math.ceil(image.height / cell.height) : grid.rows
  const gridWidth = columns * cell.width
  const gridHeight = rows * cell.height
  const wide = image.width * gridHeight > image.height * gridWidth
  const scale = wide
    ? gridWidth / Math.max(image.width, 1)
    : gridHeight / Math.max(image.height, 1)
  const padX = wide ? 0 : (gridWidth - image.width * scale) / 2 / scale
  const padY = wide ? (gridHeight - image.height * scale) / 2 / scale : 0
  const scaledWidth = image.width + padX * 2
  const scaledHeight = image.height + padY * 2
  const source = {
    x: (scaledWidth * run.column) / columns,
    y: (scaledHeight * run.row) / rows,
    width: (scaledWidth * run.width) / columns,
    height: scaledHeight / rows,
  }
  let xOffset = 0
  let yOffset = 0
  let width = run.width * cell.width
  let height = cell.height

  if (source.y < padY) {
    const offset = padY - source.y
    source.height -= offset
    yOffset = offset
    height -= offset * scale
    source.y = 0
    if (source.height > image.height) {
      source.height = image.height
      height = image.height * scale
    }
  } else if (source.y + source.height > scaledHeight - padY) {
    source.y -= padY
    source.height = scaledHeight - padY - source.y - padY
    height = source.height * scale
  } else {
    source.y -= padY
  }

  if (source.x < padX) {
    const offset = padX - source.x
    source.width -= offset
    xOffset = offset
    width -= offset * scale
    source.x = 0
    if (source.width > image.width) {
      source.width = image.width
      width = image.width * scale
    }
  } else if (source.x + source.width > scaledWidth - padX) {
    source.x -= padX
    source.width = scaledWidth - padX - source.x - padX
    width = source.width * scale
  } else {
    source.x -= padX
  }

  if (source.width <= 0 || source.height <= 0) return null
  const slice = {
    xOffset: Math.round(xOffset * scale),
    yOffset: Math.round(yOffset * scale),
    width: Math.round(width),
    height: Math.round(height),
    source: {
      x: Math.round(source.x),
      y: Math.round(source.y),
      width: Math.round(source.width),
      height: Math.round(source.height),
    },
  }
  if (slice.width === 0 || slice.height === 0) return null
  return slice
}
