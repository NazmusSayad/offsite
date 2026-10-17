import type { Row } from './render-state'
import type { ImageLayer, Metrics } from './renderer'
import { ghostty, SUCCESS } from './runtime'

export const PLACEHOLDER = 0x10eeee

const KITTY_STORAGE_LIMIT = 26
const KITTY_GRAPHICS = 30
const KITTY_PLACEMENTS = 1
const KITTY_PLACEMENT = {
  imageId: 1,
  placementId: 2,
  isVirtual: 3,
  xOffset: 4,
  yOffset: 5,
  columns: 10,
  rows: 11,
  z: 12,
} as const
const KITTY_IMAGE = {
  width: 3,
  height: 4,
  format: 5,
  data: 7,
  length: 8,
} as const
const KITTY_RENDER_INFO = {
  size: 48,
  pixelWidth: 4,
  pixelHeight: 8,
  column: 20,
  row: 24,
  visible: 28,
  sourceX: 32,
  sourceY: 36,
  sourceWidth: 40,
  sourceHeight: 44,
} as const
const KITTY_CHANNELS = new Map([
  [0, 3],
  [1, 4],
  [3, 2],
  [4, 1],
])

export type Placeholder = {
  imageId: number
  placementId: number
  row: number | null
  column: number | null
  imageIdHigh: number | null
}

type PlaceholderRun = {
  x: number
  y: number
  imageId: number
  placementId: number
  row: number
  column: number
  width: number
}

type Size = { width: number; height: number }

type KittyPlacement = {
  key: string
  z: number
  column: number
  row: number
  xOffset: number
  yOffset: number
  width: number
  height: number
  source: { x: number; y: number; width: number; height: number }
  image: { width: number; height: number; format: number; pixels: Uint8Array }
}

export type KittyImage = { placement: KittyPlacement; bitmap: OffscreenCanvas }

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

function placeholderRuns(rows: Row[]) {
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
      if (run !== null) {
        runs.push(completeRun(run))
      }
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
    if (run !== null) {
      runs.push(completeRun(run))
    }
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

function placeholderSlice(
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

  if (source.width <= 0 || source.height <= 0) {
    return null
  }
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
  if (slice.width === 0 || slice.height === 0) {
    return null
  }
  return slice
}

export function hasKittyGraphics(terminal: number) {
  const runtime = ghostty()
  const scratch = runtime.alloc(16)
  const result = runtime.call(
    'ghostty_terminal_get',
    terminal,
    KITTY_STORAGE_LIMIT,
    scratch
  )
  runtime.free(scratch, 16)
  return result === SUCCESS
}

export class KittyGraphics {
  private readonly runtime = ghostty()
  private readonly terminal: number
  private readonly iteratorSlot: number
  private readonly info: number
  private readonly scratch: number
  private tail = [0, 0]
  private commands = 0
  private cachedCommands = 0
  private bitmaps = new Map<string, OffscreenCanvas>()

  constructor(terminal: number) {
    const runtime = this.runtime
    this.terminal = terminal
    this.iteratorSlot = runtime.allocOpaque()
    runtime.check(
      'ghostty_kitty_graphics_placement_iterator_new',
      runtime.call(
        'ghostty_kitty_graphics_placement_iterator_new',
        0,
        this.iteratorSlot
      )
    )
    this.info = runtime.alloc(KITTY_RENDER_INFO.size)
    this.scratch = runtime.alloc(16)
  }

  note(data: Uint8Array) {
    const edge = [...this.tail, ...data.subarray(0, 2)]
    let found = edge.some(
      (byte, index) =>
        byte === 0x1b && edge[index + 1] === 0x5f && edge[index + 2] === 0x47
    )
    let index = data.indexOf(0x1b)
    while (!found && index !== -1) {
      found = data[index + 1] === 0x5f && data[index + 2] === 0x47
      index = data.indexOf(0x1b, index + 1)
    }
    if (found) {
      this.commands += 1
    }
    this.tail = [...this.tail, ...data.subarray(-2)].slice(-2)
  }

  images(rows: Row[], cell: Size): KittyImage[] {
    if (this.commands !== this.cachedCommands) {
      this.cachedCommands = this.commands
      this.bitmaps.clear()
    }
    const bitmaps = new Map<string, OffscreenCanvas>()
    const images = this.placements(rows, cell).map((placement) => {
      const bitmap =
        bitmaps.get(placement.key) ??
        this.bitmaps.get(placement.key) ??
        kittyBitmap(placement.image)
      bitmaps.set(placement.key, bitmap)
      return { placement, bitmap }
    })
    this.bitmaps = bitmaps
    return images
  }

  dispose() {
    const runtime = this.runtime
    runtime.call(
      'ghostty_kitty_graphics_placement_iterator_free',
      runtime.readPointer(this.iteratorSlot)
    )
    runtime.free(this.info, KITTY_RENDER_INFO.size)
    runtime.free(this.scratch, 16)
    runtime.freeOpaque(this.iteratorSlot)
    this.bitmaps.clear()
  }

  private placements(rows: Row[], cell: Size) {
    const runtime = this.runtime
    runtime.check(
      'ghostty_terminal_get',
      runtime.call(
        'ghostty_terminal_get',
        this.terminal,
        KITTY_GRAPHICS,
        this.scratch
      )
    )
    const graphics = runtime.readPointer(this.scratch)
    runtime.check(
      'ghostty_kitty_graphics_get',
      runtime.call(
        'ghostty_kitty_graphics_get',
        graphics,
        KITTY_PLACEMENTS,
        this.iteratorSlot
      )
    )
    const iterator = runtime.readPointer(this.iteratorSlot)
    const placements: KittyPlacement[] = []
    const virtual: {
      imageId: number
      placementId: number
      columns: number
      rows: number
    }[] = []
    while (runtime.call('ghostty_kitty_graphics_placement_next', iterator)) {
      const imageId = this.placementU32(iterator, KITTY_PLACEMENT.imageId)
      if (this.placementData(iterator, KITTY_PLACEMENT.isVirtual).getUint8(0)) {
        virtual.push({
          imageId,
          placementId: this.placementU32(iterator, KITTY_PLACEMENT.placementId),
          columns: this.placementU32(iterator, KITTY_PLACEMENT.columns),
          rows: this.placementU32(iterator, KITTY_PLACEMENT.rows),
        })
        continue
      }
      const image = runtime.call(
        'ghostty_kitty_graphics_image',
        graphics,
        imageId
      )
      if (image === 0) {
        throw new Error(`kitty placement points to missing image ${imageId}`)
      }
      runtime.bytes(this.info, KITTY_RENDER_INFO.size).fill(0)
      const info = runtime.view(this.info, KITTY_RENDER_INFO.size)
      info.setUint32(0, KITTY_RENDER_INFO.size, true)
      runtime.check(
        'ghostty_kitty_graphics_placement_render_info',
        runtime.call(
          'ghostty_kitty_graphics_placement_render_info',
          iterator,
          image,
          this.terminal,
          this.info
        )
      )
      if (info.getUint8(KITTY_RENDER_INFO.visible) === 0) {
        continue
      }
      placements.push({
        ...this.image(image, imageId),
        z: this.placementData(iterator, KITTY_PLACEMENT.z).getInt32(0, true),
        column: info.getInt32(KITTY_RENDER_INFO.column, true),
        row: info.getInt32(KITTY_RENDER_INFO.row, true),
        xOffset: this.placementU32(iterator, KITTY_PLACEMENT.xOffset),
        yOffset: this.placementU32(iterator, KITTY_PLACEMENT.yOffset),
        width: info.getUint32(KITTY_RENDER_INFO.pixelWidth, true),
        height: info.getUint32(KITTY_RENDER_INFO.pixelHeight, true),
        source: {
          x: info.getUint32(KITTY_RENDER_INFO.sourceX, true),
          y: info.getUint32(KITTY_RENDER_INFO.sourceY, true),
          width: info.getUint32(KITTY_RENDER_INFO.sourceWidth, true),
          height: info.getUint32(KITTY_RENDER_INFO.sourceHeight, true),
        },
      })
    }
    if (virtual.length === 0) {
      return placements
    }
    for (const run of placeholderRuns(rows)) {
      const target = virtual.find(
        (placement) =>
          placement.imageId === run.imageId &&
          (run.placementId === 0 || placement.placementId === run.placementId)
      )
      if (target === undefined) {
        continue
      }
      const image = runtime.call(
        'ghostty_kitty_graphics_image',
        graphics,
        run.imageId
      )
      if (image === 0) {
        continue
      }
      const kitty = this.image(image, run.imageId)
      const slice = placeholderSlice(run, target, kitty.image, cell)
      if (slice === null) {
        continue
      }
      placements.push({
        ...kitty,
        ...slice,
        z: -1,
        column: run.x,
        row: run.y,
      })
    }
    return placements
  }

  private image(image: number, imageId: number) {
    const pointer = this.imageData(image, KITTY_IMAGE.data)
    const length = this.imageData(image, KITTY_IMAGE.length)
    return {
      key: `${imageId}:${pointer}:${length}`,
      image: {
        width: this.imageData(image, KITTY_IMAGE.width),
        height: this.imageData(image, KITTY_IMAGE.height),
        format: this.imageData(image, KITTY_IMAGE.format),
        pixels: this.runtime.bytes(pointer, length),
      },
    }
  }

  private placementData(iterator: number, key: number) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.runtime.check(
      'ghostty_kitty_graphics_placement_get',
      this.runtime.call(
        'ghostty_kitty_graphics_placement_get',
        iterator,
        key,
        this.scratch
      )
    )
    return this.runtime.view(this.scratch, 4)
  }

  private placementU32(iterator: number, key: number) {
    return this.placementData(iterator, key).getUint32(0, true)
  }

  private imageData(image: number, key: number) {
    this.runtime.bytes(this.scratch, 4).fill(0)
    this.runtime.check(
      'ghostty_kitty_graphics_image_get',
      this.runtime.call(
        'ghostty_kitty_graphics_image_get',
        image,
        key,
        this.scratch
      )
    )
    return this.runtime.view(this.scratch, 4).getUint32(0, true)
  }
}

export function drawKitty(
  context: CanvasRenderingContext2D,
  images: KittyImage[],
  layer: ImageLayer,
  metrics: Metrics,
  cell: Size
) {
  const scaleX = metrics.width / cell.width
  const scaleY = metrics.height / cell.height
  for (const image of images) {
    const placement = image.placement
    if (kittyLayer(placement.z) !== layer) {
      continue
    }
    context.drawImage(
      image.bitmap,
      placement.source.x,
      placement.source.y,
      placement.source.width,
      placement.source.height,
      placement.column * metrics.width + placement.xOffset * scaleX,
      placement.row * metrics.height + placement.yOffset * scaleY,
      placement.width * scaleX,
      placement.height * scaleY
    )
  }
}

function kittyLayer(z: number): ImageLayer {
  if (z < -1_073_741_824) {
    return 'belowBackground'
  }
  if (z < 0) {
    return 'belowText'
  }
  return 'aboveText'
}

function kittyBitmap(image: KittyPlacement['image']) {
  const channels = KITTY_CHANNELS.get(image.format)
  if (channels === undefined) {
    throw new Error(`unsupported kitty image format ${image.format}`)
  }
  const count = image.width * image.height
  const source = image.pixels
  const data = new Uint8ClampedArray(count * 4)
  if (channels === 4) {
    data.set(source.subarray(0, count * 4))
  } else {
    for (let pixel = 0; pixel < count; pixel += 1) {
      const from = pixel * channels
      const to = pixel * 4
      if (channels === 3) {
        data.set(source.subarray(from, from + 3), to)
      } else {
        data.fill(source[from], to, to + 3)
      }
      data[to + 3] = channels === 2 ? source[from + 1] : 255
    }
  }
  const canvas = new OffscreenCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('could not create a canvas for a kitty image')
  }
  context.putImageData(new ImageData(data, image.width, image.height), 0, 0)
  return canvas
}
