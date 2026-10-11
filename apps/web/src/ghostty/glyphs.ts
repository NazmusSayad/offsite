const LINES = [
  '0101',
  '0202',
  '1010',
  '2020',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '0110',
  '0210',
  '0120',
  '0220',
  '0011',
  '0012',
  '0021',
  '0022',
  '1100',
  '1200',
  '2100',
  '2200',
  '1001',
  '1002',
  '2001',
  '2002',
  '1110',
  '1210',
  '2110',
  '1120',
  '2120',
  '2210',
  '1220',
  '2220',
  '1011',
  '1012',
  '2011',
  '1021',
  '2021',
  '2012',
  '1022',
  '2022',
  '0111',
  '0112',
  '0211',
  '0212',
  '0121',
  '0122',
  '0221',
  '0222',
  '1101',
  '1102',
  '1201',
  '1202',
  '2101',
  '2102',
  '2201',
  '2202',
  '1111',
  '1112',
  '1211',
  '1212',
  '2111',
  '1121',
  '2121',
  '2112',
  '2211',
  '1122',
  '1221',
  '2212',
  '1222',
  '2122',
  '2221',
  '2222',
]

const HALF_LINES = [
  '0001',
  '1000',
  '0100',
  '0010',
  '0002',
  '2000',
  '0200',
  '0020',
  '0201',
  '1020',
  '0102',
  '2010',
]

const UPPER_LEFT = [0, 0, 4, 4]
const UPPER_RIGHT = [4, 0, 4, 4]
const LOWER_LEFT = [0, 4, 4, 4]
const LOWER_RIGHT = [4, 4, 4, 4]

const BLOCKS: number[][][] = [
  [[0, 0, 8, 4]],
  [[0, 7, 8, 1]],
  [[0, 6, 8, 2]],
  [[0, 5, 8, 3]],
  [[0, 4, 8, 4]],
  [[0, 3, 8, 5]],
  [[0, 2, 8, 6]],
  [[0, 1, 8, 7]],
  [[0, 0, 8, 8]],
  [[0, 0, 7, 8]],
  [[0, 0, 6, 8]],
  [[0, 0, 5, 8]],
  [[0, 0, 4, 8]],
  [[0, 0, 3, 8]],
  [[0, 0, 2, 8]],
  [[0, 0, 1, 8]],
  [[4, 0, 4, 8]],
  [],
  [],
  [],
  [[0, 0, 8, 1]],
  [[7, 0, 1, 8]],
  [LOWER_LEFT],
  [LOWER_RIGHT],
  [UPPER_LEFT],
  [UPPER_LEFT, LOWER_LEFT, LOWER_RIGHT],
  [UPPER_LEFT, LOWER_RIGHT],
  [UPPER_LEFT, UPPER_RIGHT, LOWER_LEFT],
  [UPPER_LEFT, UPPER_RIGHT, LOWER_RIGHT],
  [UPPER_RIGHT],
  [UPPER_RIGHT, LOWER_LEFT],
  [UPPER_RIGHT, LOWER_LEFT, LOWER_RIGHT],
]

const SHADES: Record<number, number> = {
  0x2591: 0.25,
  0x2592: 0.5,
  0x2593: 0.75,
}

const ROUNDED: Record<number, [number, number]> = {
  0x256d: [1, 1],
  0x256e: [-1, 1],
  0x256f: [-1, -1],
  0x2570: [1, -1],
}

type Box = { left: number; top: number; width: number; height: number }

function arms(code: number) {
  if (code >= 0x2500 && code <= 0x254b) return LINES[code - 0x2500]
  if (code >= 0x2574 && code <= 0x257f) return HALF_LINES[code - 0x2574]
  return ''
}

export function isGlyph(text: string) {
  if (text.length !== 1) return false
  const code = text.charCodeAt(0)
  return (
    arms(code) !== '' ||
    ROUNDED[code] !== undefined ||
    (code >= 0x2580 && code <= 0x259f)
  )
}

function lineThickness(light: number, weight: string) {
  return weight === '2' ? light * 2 : light
}

function drawLines(
  context: CanvasRenderingContext2D,
  weights: string,
  box: Box
) {
  const light = Math.max(1, Math.round(box.height / 20))
  const centerX = box.left + Math.floor(box.width / 2)
  const centerY = box.top + Math.floor(box.height / 2)
  const vertical = Math.max(
    weights[0] === '0' ? 0 : lineThickness(light, weights[0]),
    weights[2] === '0' ? 0 : lineThickness(light, weights[2])
  )
  const horizontal = Math.max(
    weights[1] === '0' ? 0 : lineThickness(light, weights[1]),
    weights[3] === '0' ? 0 : lineThickness(light, weights[3])
  )
  const [up, right, down, left] = weights
  if (up !== '0') {
    const size = lineThickness(light, up)
    const end = centerY + Math.ceil(horizontal / 2)
    context.fillRect(
      centerX - Math.floor(size / 2),
      box.top,
      size,
      end - box.top
    )
  }
  if (down !== '0') {
    const size = lineThickness(light, down)
    const start = centerY - Math.floor(horizontal / 2)
    context.fillRect(
      centerX - Math.floor(size / 2),
      start,
      size,
      box.top + box.height - start
    )
  }
  if (left !== '0') {
    const size = lineThickness(light, left)
    const end = centerX + Math.ceil(vertical / 2)
    context.fillRect(
      box.left,
      centerY - Math.floor(size / 2),
      end - box.left,
      size
    )
  }
  if (right !== '0') {
    const size = lineThickness(light, right)
    const start = centerX - Math.floor(vertical / 2)
    context.fillRect(
      start,
      centerY - Math.floor(size / 2),
      box.left + box.width - start,
      size
    )
  }
}

function drawRounded(
  context: CanvasRenderingContext2D,
  [horizontal, vertical]: [number, number],
  box: Box
) {
  const light = Math.max(1, Math.round(box.height / 20))
  const centerX = box.left + Math.floor(box.width / 2) + (light % 2) / 2
  const centerY = box.top + Math.floor(box.height / 2) + (light % 2) / 2
  const edgeX = horizontal === 1 ? box.left + box.width : box.left
  const edgeY = vertical === 1 ? box.top + box.height : box.top
  const radius = Math.min(box.width, box.height) / 2
  context.save()
  context.strokeStyle = context.fillStyle
  context.lineWidth = light
  context.beginPath()
  context.moveTo(centerX, edgeY)
  context.arcTo(centerX, centerY, edgeX, centerY, radius)
  context.lineTo(edgeX, centerY)
  context.stroke()
  context.restore()
}

export function drawGlyph(
  context: CanvasRenderingContext2D,
  text: string,
  cell: Box
) {
  const code = text.charCodeAt(0)
  const box = {
    left: Math.round(cell.left),
    top: Math.round(cell.top),
    width: Math.round(cell.left + cell.width) - Math.round(cell.left),
    height: Math.round(cell.top + cell.height) - Math.round(cell.top),
  }
  const weights = arms(code)
  if (weights !== '') {
    drawLines(context, weights, box)
    return
  }
  const rounded = ROUNDED[code]
  if (rounded !== undefined) {
    drawRounded(context, rounded, box)
    return
  }
  const shade = SHADES[code]
  if (shade !== undefined) {
    context.save()
    context.globalAlpha = shade
    context.fillRect(box.left, box.top, box.width, box.height)
    context.restore()
    return
  }
  for (const [x, y, width, height] of BLOCKS[code - 0x2580]) {
    const left = box.left + Math.round((box.width * x) / 8)
    const top = box.top + Math.round((box.height * y) / 8)
    context.fillRect(
      left,
      top,
      box.left + Math.round((box.width * (x + width)) / 8) - left,
      box.top + Math.round((box.height * (y + height)) / 8) - top
    )
  }
}
