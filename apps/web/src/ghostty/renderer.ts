import { CELL_WIDE, type Cell, type Color, type Snapshot } from './core'
import { drawGlyph, isGlyph } from './glyphs'

export type Metrics = { width: number; height: number; baseline: number }

export type Range = {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export type Highlight = {
  row: number
  start: number
  end: number
  active: boolean
}

export type Appearance = {
  fontSize: number
  fontFamily: string
  ligatures: boolean
  cursorText: string
  selectionBackground: string
  selectionForeground: string
  matchBackground: string
  activeMatchBorder: string
}

function css(color: Color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function same(left: Color, right: Color) {
  return left.r === right.r && left.g === right.g && left.b === right.b
}

function sameText(left: Cell, right: Cell) {
  return (
    left.selected === right.selected &&
    same(left.foreground, right.foreground) &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.invisible === right.invisible
  )
}

function font(cell: Cell, appearance: Appearance) {
  return `${cell.italic ? 'italic' : 'normal'} ${cell.bold ? 700 : 400} ${appearance.fontSize}px ${appearance.fontFamily}`
}

export function measureCell(
  context: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  lineHeight: number
): Metrics {
  context.font = `normal 400 ${fontSize}px ${fontFamily}`
  const width = context.measureText('M').width
  const vertical = context.measureText('Mg')
  const ascent = vertical.fontBoundingBoxAscent || fontSize
  const descent = vertical.fontBoundingBoxDescent
  const glyphHeight = ascent + descent
  const height = Math.max(1, Math.round(glyphHeight * lineHeight))
  return {
    width: Math.max(1, width),
    height,
    baseline: Math.round((height - glyphHeight) / 2 + ascent),
  }
}

function runEnd(cells: Cell[], start: number, ligatures: boolean) {
  const first = cells[start]
  let end = start + 1
  while (end < cells.length) {
    const next = cells[end]
    if (next.wide === CELL_WIDE.spacerTail) {
      end += 1
      continue
    }
    if (
      !ligatures ||
      next.text.length === 0 ||
      isGlyph(next.text) ||
      !sameText(next, first)
    )
      break
    end += 1
  }
  return end
}

function inRange(range: Range | null, row: number, column: number) {
  if (range === null) return false
  if (row < range.start.y || row > range.end.y) return false
  if (row === range.start.y && column < range.start.x) return false
  if (row === range.end.y && column > range.end.x) return false
  return true
}

export function render(options: {
  context: CanvasRenderingContext2D
  snapshot: Snapshot
  metrics: Metrics
  appearance: Appearance
  forceFull: boolean
  cursorOn: boolean
  previousCursorY: number | null
  focused: boolean
  hoveredLink: Range | null
  highlights: Highlight[]
}) {
  const { context, snapshot, metrics, appearance, cursorOn, previousCursorY } =
    options
  const rows = options.forceFull
    ? Array.from({ length: snapshot.rows }, (_, index) => index)
    : [...snapshot.dirtyRows]
  if (previousCursorY !== null && !rows.includes(previousCursorY))
    rows.push(previousCursorY)
  if (
    snapshot.cursorVisible &&
    snapshot.cursorY >= 0 &&
    !rows.includes(snapshot.cursorY)
  )
    rows.push(snapshot.cursorY)

  if (options.forceFull) {
    context.save()
    context.resetTransform()
    context.fillStyle = css(snapshot.background)
    context.fillRect(0, 0, context.canvas.width, context.canvas.height)
    context.restore()
  }

  context.textBaseline = 'alphabetic'
  for (const rowIndex of rows) {
    const row = snapshot.rowData[rowIndex]
    if (!row) continue
    const top = rowIndex * metrics.height
    context.fillStyle = css(snapshot.background)
    context.fillRect(0, top, context.canvas.width, metrics.height)

    let start = 0
    while (start < row.cells.length) {
      const first = row.cells[start]
      let end = start + 1
      while (
        end < row.cells.length &&
        row.cells[end].selected === first.selected &&
        same(row.cells[end].background, first.background)
      )
        end += 1
      const left = start * metrics.width
      const width = (end - start) * metrics.width
      if (first.selected) {
        context.fillStyle = appearance.selectionBackground
        context.fillRect(left, top, width, metrics.height)
      } else if (!same(first.background, snapshot.background)) {
        context.fillStyle = css(first.background)
        context.fillRect(left, top, width, metrics.height)
      }
      start = end
    }

    for (const highlight of options.highlights) {
      if (highlight.row !== rowIndex) continue
      const left = highlight.start * metrics.width
      const width = (highlight.end - highlight.start) * metrics.width
      context.fillStyle = appearance.matchBackground
      context.fillRect(left, top, width, metrics.height)
      if (!highlight.active) continue
      context.strokeStyle = appearance.activeMatchBorder
      context.strokeRect(left + 0.5, top + 0.5, width - 1, metrics.height - 1)
    }

    start = 0
    while (start < row.cells.length) {
      const first = row.cells[start]
      if (first.text.length === 0) {
        start += 1
        continue
      }
      if (isGlyph(first.text)) {
        if (!first.invisible) {
          context.fillStyle = first.selected
            ? appearance.selectionForeground
            : css(first.foreground)
          drawGlyph(context, first.text, {
            left: start * metrics.width,
            top,
            width: metrics.width,
            height: metrics.height,
          })
        }
        start += 1
        continue
      }
      const end = runEnd(row.cells, start, appearance.ligatures)
      const text = row.cells
        .slice(start, end)
        .map((cell) => cell.text)
        .join('')
      if (!first.invisible && text.trim().length > 0) {
        context.save()
        context.beginPath()
        context.rect(
          start * metrics.width,
          top,
          (end - start) * metrics.width,
          metrics.height
        )
        context.clip()
        context.font = font(first, appearance)
        context.fillStyle = first.selected
          ? appearance.selectionForeground
          : css(first.foreground)
        context.fillText(text, start * metrics.width, top + metrics.baseline)
        context.restore()
      }
      start = end
    }

    for (let column = 0; column < row.cells.length; column += 1) {
      const cell = row.cells[column]
      const link = inRange(options.hoveredLink, rowIndex, column)
      if (!cell.underline && !cell.strikethrough && !cell.overline && !link)
        continue
      context.fillStyle = css(cell.foreground)
      const left = column * metrics.width
      if (cell.underline || link)
        context.fillRect(left, top + metrics.height - 2, metrics.width, 1)
      if (cell.strikethrough)
        context.fillRect(
          left,
          top + Math.floor(metrics.height * 0.55),
          metrics.width,
          1
        )
      if (cell.overline) context.fillRect(left, top + 1, metrics.width, 1)
    }
  }

  if (
    !cursorOn ||
    !snapshot.cursorVisible ||
    snapshot.cursorX < 0 ||
    snapshot.cursorY < 0
  )
    return
  const left = snapshot.cursorX * metrics.width
  const top = snapshot.cursorY * metrics.height
  const cells = snapshot.rowData[snapshot.cursorY]?.cells
  const cell = cells?.[snapshot.cursorX]
  const width =
    cells?.[snapshot.cursorX + 1]?.wide === CELL_WIDE.spacerTail
      ? metrics.width * 2
      : metrics.width
  context.fillStyle = css(snapshot.cursor)
  context.strokeStyle = css(snapshot.cursor)
  if (!options.focused || snapshot.cursorStyle === 3) {
    context.strokeRect(left + 0.5, top + 0.5, width - 1, metrics.height - 1)
    return
  }
  if (snapshot.cursorStyle === 0) {
    context.fillRect(left, top, 2, metrics.height)
    return
  }
  if (snapshot.cursorStyle === 2) {
    context.fillRect(left, top + metrics.height - 2, width, 2)
    return
  }
  context.fillRect(left, top, width, metrics.height)
  if (!cell?.text) return
  context.fillStyle = appearance.cursorText
  if (isGlyph(cell.text)) {
    drawGlyph(context, cell.text, {
      left,
      top,
      width: metrics.width,
      height: metrics.height,
    })
    return
  }
  context.font = font(cell, appearance)
  context.fillText(cell.text, left, top + metrics.baseline)
}
