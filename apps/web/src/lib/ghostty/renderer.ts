import { drawGlyph, isGlyph } from './glyphs'
import { CELL_WIDE, type Cell, type Color, type Snapshot } from './render-state'

export type Metrics = {
  width: number
  height: number
  baseline: number
  faceWidth: number
}

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

export type ImageLayer = 'belowBackground' | 'belowText' | 'aboveText'

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

function snap(value: number, ratio: number) {
  return Math.round(value * ratio) / ratio
}

function columns(start: number, end: number, metrics: Metrics, ratio: number) {
  const left = snap(start * metrics.width, ratio)
  return { left, width: snap(end * metrics.width, ratio) - left }
}

function drawUnderline(
  context: CanvasRenderingContext2D,
  style: number,
  left: number,
  width: number,
  bottom: number
) {
  const y = bottom - 2
  const right = left + width
  if (style === 1) {
    context.fillRect(left, y, width, 1)
    return
  }
  if (style === 2) {
    context.fillRect(left, y, width, 1)
    context.fillRect(left, y - 2, width, 1)
    return
  }
  if (style === 3) {
    function wave(x: number) {
      return y - 1 + Math.sin((x / 3) * Math.PI) * 1.5
    }
    context.save()
    context.strokeStyle = context.fillStyle
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(left, wave(left))
    for (let x = Math.floor(left) + 1; x < right; x += 1)
      context.lineTo(x, wave(x))
    context.lineTo(right, wave(right))
    context.stroke()
    context.restore()
    return
  }
  if (style === 4) {
    for (let x = Math.ceil(left / 2) * 2; x < right; x += 2)
      context.fillRect(x, y, 1, 1)
    return
  }
  if (style === 5) {
    for (let x = Math.floor(left / 5) * 5; x < right; x += 5) {
      const from = Math.max(x, left)
      const to = Math.min(x + 3, right)
      if (to > from) context.fillRect(from, y, to - from, 1)
    }
    return
  }
  throw new Error(`unknown underline style ${style}`)
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
  lineHeight: number,
  pixelRatio: number
): Metrics {
  context.font = `normal 400 ${fontSize}px ${fontFamily}`
  const faceWidth = context.measureText('M').width
  const vertical = context.measureText('Mg')
  const ascent = vertical.fontBoundingBoxAscent || fontSize
  const descent = vertical.fontBoundingBoxDescent
  const glyphHeight = ascent + descent
  const height =
    Math.max(1, Math.round(glyphHeight * lineHeight * pixelRatio)) / pixelRatio
  return {
    width: Math.max(1, Math.round(faceWidth * pixelRatio)) / pixelRatio,
    height,
    baseline: snap((height - glyphHeight) / 2 + ascent, pixelRatio),
    faceWidth,
  }
}

function isOperator(text: string) {
  return /^[!-/:-@[-`{-~]$/.test(text)
}

export function inRange(range: Range | null, row: number, column: number) {
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
  pixelRatio: number
  drawLayer: (layer: ImageLayer) => void
}) {
  const {
    context,
    snapshot,
    metrics,
    appearance,
    cursorOn,
    previousCursorY,
    pixelRatio,
  } = options
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

  function bounds(rowIndex: number) {
    const top = rowIndex * metrics.height
    const cellTop = snap(top, pixelRatio)
    const cellHeight = snap(top + metrics.height, pixelRatio) - cellTop
    return { top, cellTop, cellHeight }
  }

  context.textBaseline = 'alphabetic'
  for (const rowIndex of rows) {
    if (!snapshot.rowData[rowIndex]) continue
    const { cellTop, cellHeight } = bounds(rowIndex)
    context.fillStyle = css(snapshot.background)
    context.fillRect(0, cellTop, context.canvas.width, cellHeight)
  }

  options.drawLayer('belowBackground')
  for (const rowIndex of rows) {
    const row = snapshot.rowData[rowIndex]
    if (!row) continue
    const { cellTop, cellHeight } = bounds(rowIndex)
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
      const { left, width } = columns(start, end, metrics, pixelRatio)
      if (first.selected) {
        context.fillStyle = appearance.selectionBackground
        context.fillRect(left, cellTop, width, cellHeight)
      } else if (!same(first.background, snapshot.background)) {
        context.fillStyle = css(first.background)
        context.fillRect(left, cellTop, width, cellHeight)
      }
      start = end
    }

    for (const highlight of options.highlights) {
      if (highlight.row !== rowIndex) continue
      const { left, width } = columns(
        highlight.start,
        highlight.end,
        metrics,
        pixelRatio
      )
      context.fillStyle = appearance.matchBackground
      context.fillRect(left, cellTop, width, cellHeight)
      if (!highlight.active) continue
      context.strokeStyle = appearance.activeMatchBorder
      context.strokeRect(left + 0.5, cellTop + 0.5, width - 1, cellHeight - 1)
    }
  }

  options.drawLayer('belowText')
  for (const rowIndex of rows) {
    const row = snapshot.rowData[rowIndex]
    if (!row) continue
    const { top, cellTop, cellHeight } = bounds(rowIndex)
    context.save()
    context.beginPath()
    context.rect(0, cellTop, context.canvas.width, cellHeight)
    context.clip()
    for (let column = 0; column < row.cells.length; column += 1) {
      const cell = row.cells[column]
      if (cell.invisible || cell.text.trim().length === 0) continue
      context.fillStyle = cell.selected
        ? appearance.selectionForeground
        : css(cell.foreground)
      const left = column * metrics.width
      if (isGlyph(cell.text)) {
        drawGlyph(
          context,
          cell.text,
          { left, top, width: metrics.width, height: metrics.height },
          pixelRatio
        )
        continue
      }
      context.font = font(cell, appearance)
      const x = left + (metrics.width - metrics.faceWidth) / 2
      let from = column
      let to = column + 1
      if (appearance.ligatures && isOperator(cell.text)) {
        while (
          from > column - 3 &&
          from > 0 &&
          isOperator(row.cells[from - 1].text) &&
          sameText(row.cells[from - 1], cell)
        )
          from -= 1
        while (
          to < column + 4 &&
          to < row.cells.length &&
          isOperator(row.cells[to].text) &&
          sameText(row.cells[to], cell)
        )
          to += 1
      }
      if (to - from === 1) {
        context.fillText(cell.text, x, top + metrics.baseline)
        continue
      }
      context.save()
      context.beginPath()
      context.rect(left, top, metrics.width, metrics.height)
      context.clip()
      context.fillText(
        row.cells
          .slice(from, to)
          .map((neighbor) => neighbor.text)
          .join(''),
        x - (column - from) * metrics.faceWidth,
        top + metrics.baseline
      )
      context.restore()
    }
    context.restore()

    for (let column = 0; column < row.cells.length; column += 1) {
      const cell = row.cells[column]
      const link = inRange(options.hoveredLink, rowIndex, column)
      if (
        cell.underline === 0 &&
        !cell.strikethrough &&
        !cell.overline &&
        !link
      )
        continue
      const { left, width } = columns(column, column + 1, metrics, pixelRatio)
      const bottom = cellTop + cellHeight
      context.fillStyle = css(cell.foreground)
      if (cell.strikethrough)
        context.fillRect(
          left,
          top + Math.floor(metrics.height * 0.55),
          width,
          1
        )
      if (cell.overline) context.fillRect(left, cellTop + 1, width, 1)
      if (cell.underline !== 0) {
        if (cell.underlineColor !== null)
          context.fillStyle = css(cell.underlineColor)
        drawUnderline(context, cell.underline, left, width, bottom)
      } else if (link) drawUnderline(context, 1, left, width, bottom)
    }
  }

  if (
    !cursorOn ||
    !snapshot.cursorVisible ||
    snapshot.cursorX < 0 ||
    snapshot.cursorY < 0
  )
    return
  const top = snapshot.cursorY * metrics.height
  const cursorTop = snap(top, pixelRatio)
  const height = snap(top + metrics.height, pixelRatio) - cursorTop
  const cells = snapshot.rowData[snapshot.cursorY]?.cells
  const cell = cells?.[snapshot.cursorX]
  const span =
    cells?.[snapshot.cursorX + 1]?.wide === CELL_WIDE.spacerTail ? 2 : 1
  const { left, width } = columns(
    snapshot.cursorX,
    snapshot.cursorX + span,
    metrics,
    pixelRatio
  )
  context.fillStyle = css(snapshot.cursor)
  context.strokeStyle = css(snapshot.cursor)
  if (!options.focused || snapshot.cursorStyle === 3) {
    context.strokeRect(left + 0.5, cursorTop + 0.5, width - 1, height - 1)
    return
  }
  if (snapshot.cursorStyle === 0) {
    context.fillRect(left, cursorTop, 1, height)
    return
  }
  if (snapshot.cursorStyle === 2) {
    context.fillRect(left, cursorTop + height - 2, width, 2)
    return
  }
  context.fillRect(left, cursorTop, width, height)
  if (!cell?.text) return
  context.fillStyle = appearance.cursorText
  if (isGlyph(cell.text)) {
    drawGlyph(
      context,
      cell.text,
      {
        left: snapshot.cursorX * metrics.width,
        top,
        width: metrics.width,
        height: metrics.height,
      },
      pixelRatio
    )
    return
  }
  context.font = font(cell, appearance)
  context.fillText(
    cell.text,
    snapshot.cursorX * metrics.width + (metrics.width - metrics.faceWidth) / 2,
    top + metrics.baseline
  )
}
