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

const DOUBLE_LINES = [
  '0303',
  '3030',
  '0310',
  '0130',
  '0330',
  '0013',
  '0031',
  '0033',
  '1300',
  '3100',
  '3300',
  '1003',
  '3001',
  '3003',
  '1310',
  '3130',
  '3330',
  '1013',
  '3031',
  '3033',
  '0313',
  '0131',
  '0333',
  '1303',
  '3101',
  '3303',
  '1313',
  '3131',
  '3333',
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
  if (code >= 0x2550 && code <= 0x256c) return DOUBLE_LINES[code - 0x2550]
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

function lightThickness(box: Box) {
  return Math.max(1, Math.round(box.height / 20))
}

function drawLines(
  context: CanvasRenderingContext2D,
  weights: string,
  box: Box
) {
  const [up, right, down, left] = weights
  const light = lightThickness(box)
  const heavy = light * 2
  const hLightTop = Math.floor(Math.max(0, box.height - light) / 2)
  const hLightBottom = hLightTop + light
  const hHeavyTop = Math.floor(Math.max(0, box.height - heavy) / 2)
  const hHeavyBottom = hHeavyTop + heavy
  const hDoubleTop = Math.max(0, hLightTop - light)
  const hDoubleBottom = hLightBottom + light
  const vLightLeft = Math.floor(Math.max(0, box.width - light) / 2)
  const vLightRight = vLightLeft + light
  const vHeavyLeft = Math.floor(Math.max(0, box.width - heavy) / 2)
  const vHeavyRight = vHeavyLeft + heavy
  const vDoubleLeft = Math.max(0, vLightLeft - light)
  const vDoubleRight = vLightRight + light
  function fill(x0: number, y0: number, x1: number, y1: number) {
    context.fillRect(box.left + x0, box.top + y0, x1 - x0, y1 - y0)
  }

  const upBottom =
    left === '2' || right === '2'
      ? hHeavyBottom
      : left !== right || down === up
        ? left === '3' || right === '3'
          ? hDoubleBottom
          : hLightBottom
        : left === '0' && right === '0'
          ? hLightBottom
          : hLightTop
  const downTop =
    left === '2' || right === '2'
      ? hHeavyTop
      : left !== right || up === down
        ? left === '3' || right === '3'
          ? hDoubleTop
          : hLightTop
        : left === '0' && right === '0'
          ? hLightTop
          : hLightBottom
  const leftRight =
    up === '2' || down === '2'
      ? vHeavyRight
      : up !== down || left === right
        ? up === '3' || down === '3'
          ? vDoubleRight
          : vLightRight
        : up === '0' && down === '0'
          ? vLightRight
          : vLightLeft
  const rightLeft =
    up === '2' || down === '2'
      ? vHeavyLeft
      : up !== down || right === left
        ? up === '3' || down === '3'
          ? vDoubleLeft
          : vLightLeft
        : up === '0' && down === '0'
          ? vLightLeft
          : vLightRight

  if (up === '1') fill(vLightLeft, 0, vLightRight, upBottom)
  if (up === '2') fill(vHeavyLeft, 0, vHeavyRight, upBottom)
  if (up === '3') {
    fill(vDoubleLeft, 0, vLightLeft, left === '3' ? hLightTop : upBottom)
    fill(vLightRight, 0, vDoubleRight, right === '3' ? hLightTop : upBottom)
  }
  if (right === '1') fill(rightLeft, hLightTop, box.width, hLightBottom)
  if (right === '2') fill(rightLeft, hHeavyTop, box.width, hHeavyBottom)
  if (right === '3') {
    fill(up === '3' ? vLightRight : rightLeft, hDoubleTop, box.width, hLightTop)
    fill(
      down === '3' ? vLightRight : rightLeft,
      hLightBottom,
      box.width,
      hDoubleBottom
    )
  }
  if (down === '1') fill(vLightLeft, downTop, vLightRight, box.height)
  if (down === '2') fill(vHeavyLeft, downTop, vHeavyRight, box.height)
  if (down === '3') {
    fill(
      vDoubleLeft,
      left === '3' ? hLightBottom : downTop,
      vLightLeft,
      box.height
    )
    fill(
      vLightRight,
      right === '3' ? hLightBottom : downTop,
      vDoubleRight,
      box.height
    )
  }
  if (left === '1') fill(0, hLightTop, leftRight, hLightBottom)
  if (left === '2') fill(0, hHeavyTop, leftRight, hHeavyBottom)
  if (left === '3') {
    fill(0, hDoubleTop, up === '3' ? vLightLeft : leftRight, hLightTop)
    fill(0, hLightBottom, down === '3' ? vLightLeft : leftRight, hDoubleBottom)
  }
}

function drawRounded(
  context: CanvasRenderingContext2D,
  [horizontal, vertical]: [number, number],
  box: Box
) {
  const light = lightThickness(box)
  const centerX =
    box.left + Math.floor(Math.max(0, box.width - light) / 2) + light / 2
  const centerY =
    box.top + Math.floor(Math.max(0, box.height - light) / 2) + light / 2
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
  cell: Box,
  pixelRatio: number
) {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  drawPixels(context, text.charCodeAt(0), {
    left: Math.round(cell.left * pixelRatio),
    top: Math.round(cell.top * pixelRatio),
    width:
      Math.round((cell.left + cell.width) * pixelRatio) -
      Math.round(cell.left * pixelRatio),
    height:
      Math.round((cell.top + cell.height) * pixelRatio) -
      Math.round(cell.top * pixelRatio),
  })
  context.restore()
}

function drawPixels(context: CanvasRenderingContext2D, code: number, box: Box) {
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
    context.globalAlpha = shade
    context.fillRect(box.left, box.top, box.width, box.height)
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
