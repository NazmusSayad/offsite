import { convertIndexedToRgb, decode } from 'fast-png'
import { PALETTE_ANSI_256, PALETTE_VT340_COLOR } from 'sixel/lib/Colors'
import { decodeAsync } from 'sixel/lib/Decoder'
import type { GhosttyCore } from './core'

const palette = PALETTE_ANSI_256.slice()
palette.set(PALETTE_VT340_COLOR)
const IMAGE_LIMIT = 200
const encoder = new TextEncoder()

export const IMAGE_MARKER = 'offsite-image:'

type Image = {
  ref: number
  marker: string
  bitmap: ImageBitmap
  width: number
  height: number
  alternate: boolean
}

export type Area = {
  cellWidth: number
  cellHeight: number
  width: number
  height: number
  pixelRatio: number
}

export async function decodeSixel(data: Uint8Array) {
  const result = await decodeAsync(data, { fillColor: 0, palette })
  if (!result.width || !result.height) return null
  return createImageBitmap(
    new ImageData(
      new Uint8ClampedArray(result.data8),
      result.width,
      result.height
    )
  )
}

function dimension(value: string | undefined, total: number, cell: number) {
  if (value === undefined || value === 'auto') return 0
  if (value.endsWith('%')) return (parseInt(value.slice(0, -1)) * total) / 100
  if (value.endsWith('px')) return parseInt(value.slice(0, -2))
  return parseInt(value) * cell
}

export async function decodeInlineImage(text: string, area: Area) {
  const separator = text.indexOf(':')
  if (separator === -1) return null
  const fields = new Map(
    text
      .slice(0, separator)
      .split(';')
      .map((field) => {
        const index = field.indexOf('=')
        return [field.slice(0, index), field.slice(index + 1)] as const
      })
  )
  if (fields.get('inline') !== '1') return null
  const bytes = Uint8Array.from(atob(text.slice(separator + 1)), (character) =>
    character.charCodeAt(0)
  )
  const image = await createImageBitmap(new Blob([bytes]))
  const width = dimension(fields.get('width'), area.width, area.cellWidth)
  const height = dimension(fields.get('height'), area.height, area.cellHeight)
  let size = [image.width, image.height]
  if (!width && !height) {
    const factor = Math.min(
      area.width / image.width,
      (area.height - area.cellHeight) / image.height
    )
    if (factor < 1) size = [image.width * factor, image.height * factor]
  } else if (!width) {
    size = [(image.width * height) / image.height, height]
  } else if (fields.get('preserveAspectRatio') !== '0' || !height) {
    size = [width, (image.height * width) / image.width]
  } else {
    size = [width, height]
  }
  const [resizeWidth, resizeHeight] = size.map((value) =>
    Math.max(1, Math.floor(value * area.pixelRatio))
  )
  const resized = await createImageBitmap(image, { resizeWidth, resizeHeight })
  image.close()
  return resized
}

export function decodePng(bytes: Uint8Array) {
  const png = decode(bytes)
  const { width, height, depth, channels } = png
  const pixels = width * height
  const data = new Uint8Array(pixels * 4)
  if (png.palette) {
    const colors = convertIndexedToRgb(png)
    const size = png.palette[0].length
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      data.set(colors.subarray(pixel * size, pixel * size + 3), pixel * 4)
      data[pixel * 4 + 3] = size === 4 ? colors[pixel * size + 3] : 255
    }
    return { width, height, data }
  }
  const maximum = 2 ** depth - 1
  const rowBytes = Math.ceil((width * depth) / 8)
  function read(index: number) {
    if (depth >= 8) return png.data[index]
    const bit = (index % width) * depth
    const byte = png.data[Math.floor(index / width) * rowBytes + (bit >> 3)]
    return (byte >> (8 - depth - (bit & 7))) & maximum
  }
  function scale(value: number) {
    if (depth === 16) return value >> 8
    if (depth === 8) return value
    return Math.round((value * 255) / maximum)
  }
  const key = png.transparency
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4
    if (channels === 1 || channels === 2) {
      const gray = read(pixel * channels)
      data.fill(scale(gray), offset, offset + 3)
      data[offset + 3] =
        channels === 2
          ? scale(read(pixel * 2 + 1))
          : key?.[0] === gray
            ? 0
            : 255
      continue
    }
    if (channels === 3 || channels === 4) {
      const red = read(pixel * channels)
      const green = read(pixel * channels + 1)
      const blue = read(pixel * channels + 2)
      data[offset] = scale(red)
      data[offset + 1] = scale(green)
      data[offset + 2] = scale(blue)
      data[offset + 3] =
        channels === 4
          ? scale(read(pixel * 4 + 3))
          : key?.[0] === red && key[1] === green && key[2] === blue
            ? 0
            : 255
      continue
    }
    throw new Error(`unsupported PNG with ${channels} channels`)
  }
  return { width, height, data }
}

export class InlineImages {
  private readonly core: GhosttyCore
  private images: Image[] = []
  private nextImage = 0

  constructor(core: GhosttyCore) {
    this.core = core
  }

  place(bitmap: ImageBitmap, pixelRatio: number, cellHeight: number) {
    const marker = `${IMAGE_MARKER}${this.nextImage++}`
    this.core.write(encoder.encode(`\x1b]8;;${marker}\x1b\\ \x1b]8;;\x1b\\\b`))
    const image = {
      ref: this.core.trackCursor(),
      marker,
      bitmap,
      width: bitmap.width / pixelRatio,
      height: bitmap.height / pixelRatio,
      alternate: this.core.isAlternateScreen(),
    }
    this.images.push(image)
    if (this.images.length > IMAGE_LIMIT) {
      const oldest = this.images.shift()
      if (oldest) this.remove(oldest)
    }
    const rows = Math.ceil(image.height / cellHeight)
    if (rows > 1) this.core.write(encoder.encode('\x1bD'.repeat(rows - 1)))
  }

  visible(top: number, rows: number, cellHeight: number) {
    if (this.images.length === 0) return []
    const alternate = this.core.isAlternateScreen()
    const visible: {
      bitmap: ImageBitmap
      width: number
      height: number
      x: number
      y: number
    }[] = []
    const kept: Image[] = []
    for (const image of this.images) {
      if (image.alternate !== alternate) {
        kept.push(image)
        continue
      }
      const point = this.core.trackedPoint(image.ref)
      if (
        point === null ||
        this.core.trackedHyperlink(image.ref) !== image.marker
      ) {
        this.remove(image)
        continue
      }
      kept.push(image)
      const y = point.y - top
      const height = Math.ceil(image.height / cellHeight)
      if (y + height <= 0 || y >= rows) continue
      visible.push({
        bitmap: image.bitmap,
        width: image.width,
        height: image.height,
        x: point.x,
        y,
      })
    }
    this.images = kept
    return visible
  }

  clear() {
    for (const image of this.images) this.remove(image)
    this.images = []
  }

  private remove(image: Image) {
    this.core.untrack(image.ref)
    image.bitmap.close()
  }
}
