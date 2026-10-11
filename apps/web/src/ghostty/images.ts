import { PALETTE_ANSI_256, PALETTE_VT340_COLOR } from 'sixel/lib/Colors'
import { decodeAsync } from 'sixel/lib/Decoder'

const palette = PALETTE_ANSI_256.slice()
palette.set(PALETTE_VT340_COLOR)

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

function dimension(value: string, total: number, cell: number) {
  if (value === 'auto') return 0
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
  const width = dimension(
    fields.get('width') ?? 'auto',
    area.width,
    area.cellWidth
  )
  const height = dimension(
    fields.get('height') ?? 'auto',
    area.height,
    area.cellHeight
  )
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
