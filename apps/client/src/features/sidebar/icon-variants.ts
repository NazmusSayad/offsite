const VARIANT_SIZE = 256

export const CATEGORIES = [
  'Color',
  'Background',
  'Badge',
  'Frame',
  'Transform',
] as const

export const VARIANTS = [
  { category: 'Color', label: 'Grayscale', filter: 'grayscale(1)', tint: null },
  { category: 'Color', label: 'Dimmed', filter: 'opacity(0.55)', tint: null },
  { category: 'Color', label: 'Dark', filter: 'brightness(0.55)', tint: null },
  {
    category: 'Color',
    label: 'Inverted',
    filter: 'invert(1) hue-rotate(180deg)',
    tint: null,
  },
  {
    category: 'Color',
    label: 'Hue +120°',
    filter: 'hue-rotate(120deg)',
    tint: null,
  },
  {
    category: 'Color',
    label: 'Hue −120°',
    filter: 'hue-rotate(240deg)',
    tint: null,
  },
  { category: 'Color', label: 'Blue', filter: 'none', tint: '#3b82f6' },
  { category: 'Color', label: 'Green', filter: 'none', tint: '#22c55e' },
  { category: 'Color', label: 'Orange', filter: 'none', tint: '#f97316' },
  { category: 'Color', label: 'Pink', filter: 'none', tint: '#ec4899' },
  { category: 'Color', label: 'Sepia', filter: 'sepia(1)', tint: null },
  { category: 'Color', label: 'Vivid', filter: 'saturate(2.5)', tint: null },
  {
    category: 'Color',
    label: 'Hue +60°',
    filter: 'hue-rotate(60deg)',
    tint: null,
  },
  {
    category: 'Color',
    label: 'Hue −60°',
    filter: 'hue-rotate(300deg)',
    tint: null,
  },
  { category: 'Color', label: 'Purple', filter: 'none', tint: '#a855f7' },
  { category: 'Color', label: 'Teal', filter: 'none', tint: '#14b8a6' },
  { category: 'Color', label: 'Red', filter: 'none', tint: '#ef4444' },
  { category: 'Color', label: 'Yellow', filter: 'none', tint: '#eab308' },
] as const

export const SHAPES: {
  category: (typeof CATEGORIES)[number]
  label: string
  draw: (
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    letter: string
  ) => void
}[] = [
  {
    category: 'Badge',
    label: 'Machine badge',
    draw: (context, image, letter) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#ec4899'
      context.strokeStyle = '#ffffff'
      context.lineWidth = VARIANT_SIZE * 0.04
      context.beginPath()
      context.arc(
        VARIANT_SIZE * 0.74,
        VARIANT_SIZE * 0.74,
        VARIANT_SIZE * 0.24,
        0,
        Math.PI * 2
      )
      context.fill()
      context.stroke()
      context.fillStyle = '#ffffff'
      context.font = `bold ${VARIANT_SIZE * 0.28}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(letter, VARIANT_SIZE * 0.74, VARIANT_SIZE * 0.75)
    },
  },
  {
    category: 'Badge',
    label: 'Corner',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#22c55e'
      context.beginPath()
      context.moveTo(VARIANT_SIZE * 0.55, 0)
      context.lineTo(VARIANT_SIZE, 0)
      context.lineTo(VARIANT_SIZE, VARIANT_SIZE * 0.45)
      context.closePath()
      context.fill()
    },
  },
  {
    category: 'Frame',
    label: 'Ring',
    draw: (context, image) => ring(context, image, '#f97316', []),
  },
  {
    category: 'Badge',
    label: 'Stripe',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#a855f7'
      context.fillRect(0, VARIANT_SIZE * 0.8, VARIANT_SIZE, VARIANT_SIZE * 0.2)
    },
  },
  {
    category: 'Background',
    label: 'Dark tile',
    draw: (context, image) => tile(context, image, '#18181b'),
  },
  {
    category: 'Background',
    label: 'Light tile',
    draw: (context, image) => tile(context, image, '#f4f4f5'),
  },
  {
    category: 'Background',
    label: 'Blue tile',
    draw: (context, image) => tile(context, image, '#3b82f6'),
  },
  {
    category: 'Transform',
    label: 'Zoomed in',
    draw: (context, image) =>
      cover(context, image, -VARIANT_SIZE * 0.2, VARIANT_SIZE * 1.4),
  },
  {
    category: 'Background',
    label: 'Green tile',
    draw: (context, image) => tile(context, image, '#22c55e'),
  },
  {
    category: 'Background',
    label: 'Orange tile',
    draw: (context, image) => tile(context, image, '#f97316'),
  },
  {
    category: 'Background',
    label: 'Pink tile',
    draw: (context, image) => tile(context, image, '#ec4899'),
  },
  {
    category: 'Background',
    label: 'Purple tile',
    draw: (context, image) => tile(context, image, '#a855f7'),
  },
  {
    category: 'Background',
    label: 'Gradient tile',
    draw: (context, image) => {
      const fill = context.createLinearGradient(
        0,
        0,
        VARIANT_SIZE,
        VARIANT_SIZE
      )
      fill.addColorStop(0, '#3b82f6')
      fill.addColorStop(1, '#ec4899')
      tile(context, image, fill)
    },
  },
  {
    category: 'Background',
    label: 'Dark circle',
    draw: (context, image) => {
      context.fillStyle = '#18181b'
      context.beginPath()
      context.arc(
        VARIANT_SIZE / 2,
        VARIANT_SIZE / 2,
        VARIANT_SIZE / 2,
        0,
        Math.PI * 2
      )
      context.fill()
      cover(context, image, VARIANT_SIZE * 0.2, VARIANT_SIZE * 0.6)
    },
  },
  {
    category: 'Badge',
    label: 'Top stripe',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#3b82f6'
      context.fillRect(0, 0, VARIANT_SIZE, VARIANT_SIZE * 0.2)
    },
  },
  {
    category: 'Badge',
    label: 'Side bar',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#f97316'
      context.fillRect(0, 0, VARIANT_SIZE * 0.2, VARIANT_SIZE)
    },
  },
  {
    category: 'Badge',
    label: 'Dot',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#22c55e'
      context.strokeStyle = '#ffffff'
      context.lineWidth = VARIANT_SIZE * 0.04
      context.beginPath()
      context.arc(
        VARIANT_SIZE * 0.8,
        VARIANT_SIZE * 0.2,
        VARIANT_SIZE * 0.16,
        0,
        Math.PI * 2
      )
      context.fill()
      context.stroke()
    },
  },
  {
    category: 'Badge',
    label: 'Bottom corner',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.fillStyle = '#ec4899'
      context.beginPath()
      context.moveTo(0, VARIANT_SIZE * 0.55)
      context.lineTo(0, VARIANT_SIZE)
      context.lineTo(VARIANT_SIZE * 0.45, VARIANT_SIZE)
      context.closePath()
      context.fill()
    },
  },
  {
    category: 'Badge',
    label: 'Sash',
    draw: (context, image) => {
      cover(context, image, 0, VARIANT_SIZE)
      context.strokeStyle = '#eab308'
      context.lineWidth = VARIANT_SIZE * 0.14
      context.beginPath()
      context.moveTo(VARIANT_SIZE * 0.5, VARIANT_SIZE * 1.05)
      context.lineTo(VARIANT_SIZE * 1.05, VARIANT_SIZE * 0.5)
      context.stroke()
    },
  },
  {
    category: 'Frame',
    label: 'Blue ring',
    draw: (context, image) => ring(context, image, '#3b82f6', []),
  },
  {
    category: 'Frame',
    label: 'Green ring',
    draw: (context, image) => ring(context, image, '#22c55e', []),
  },
  {
    category: 'Frame',
    label: 'Pink ring',
    draw: (context, image) => ring(context, image, '#ec4899', []),
  },
  {
    category: 'Frame',
    label: 'White ring',
    draw: (context, image) => ring(context, image, '#ffffff', []),
  },
  {
    category: 'Frame',
    label: 'Dashed ring',
    draw: (context, image) =>
      ring(context, image, '#f97316', [
        VARIANT_SIZE * 0.1,
        VARIANT_SIZE * 0.06,
      ]),
  },
  {
    category: 'Frame',
    label: 'Round ring',
    draw: (context, image) => {
      cover(context, image, VARIANT_SIZE * 0.2, VARIANT_SIZE * 0.6)
      context.strokeStyle = '#3b82f6'
      context.lineWidth = VARIANT_SIZE * 0.1
      context.beginPath()
      context.arc(
        VARIANT_SIZE / 2,
        VARIANT_SIZE / 2,
        VARIANT_SIZE * 0.45,
        0,
        Math.PI * 2
      )
      context.stroke()
    },
  },
  {
    category: 'Frame',
    label: 'Double ring',
    draw: (context, image) => {
      cover(context, image, VARIANT_SIZE * 0.2, VARIANT_SIZE * 0.6)
      context.strokeStyle = '#a855f7'
      context.lineWidth = VARIANT_SIZE * 0.05
      for (const inset of [0.03, 0.12]) {
        context.beginPath()
        context.roundRect(
          VARIANT_SIZE * inset,
          VARIANT_SIZE * inset,
          VARIANT_SIZE * (1 - inset * 2),
          VARIANT_SIZE * (1 - inset * 2),
          VARIANT_SIZE * 0.2
        )
        context.stroke()
      }
    },
  },
  {
    category: 'Transform',
    label: 'Zoomed out',
    draw: (context, image) =>
      cover(context, image, VARIANT_SIZE * 0.18, VARIANT_SIZE * 0.64),
  },
  {
    category: 'Transform',
    label: 'Circle crop',
    draw: (context, image) => {
      context.beginPath()
      context.arc(
        VARIANT_SIZE / 2,
        VARIANT_SIZE / 2,
        VARIANT_SIZE / 2,
        0,
        Math.PI * 2
      )
      context.clip()
      cover(context, image, 0, VARIANT_SIZE)
    },
  },
  {
    category: 'Transform',
    label: 'Upside down',
    draw: (context, image) => turn(context, image, 180, 1),
  },
  {
    category: 'Transform',
    label: 'Rotated',
    draw: (context, image) => turn(context, image, 90, 1),
  },
  {
    category: 'Transform',
    label: 'Tilted',
    draw: (context, image) => turn(context, image, -15, 0.75),
  },
  {
    category: 'Transform',
    label: 'Pixelated',
    draw: (context, image) => {
      const small = document.createElement('canvas')
      small.width = 12
      small.height = 12
      const smallContext = small.getContext('2d')
      if (smallContext === null) {
        throw new Error('This browser cannot draw icon variants')
      }
      cover(smallContext, image, 0, 12)
      context.imageSmoothingEnabled = false
      context.drawImage(small, 0, 0, VARIANT_SIZE, VARIANT_SIZE)
    },
  },
]

export function render(
  image: HTMLImageElement,
  filter: string,
  tint: string | null
) {
  const width = image.naturalWidth === 0 ? VARIANT_SIZE : image.naturalWidth
  const height = image.naturalHeight === 0 ? VARIANT_SIZE : image.naturalHeight
  const scale = VARIANT_SIZE / Math.max(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('This browser cannot draw icon variants')
  }
  context.filter = filter
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if (tint !== null) {
    context.filter = 'none'
    context.globalCompositeOperation = 'source-atop'
    context.globalAlpha = 0.5
    context.fillStyle = tint
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/png')
}

export function renderShape(
  image: HTMLImageElement,
  shape: (typeof SHAPES)[number],
  letter: string
) {
  const canvas = document.createElement('canvas')
  canvas.width = VARIANT_SIZE
  canvas.height = VARIANT_SIZE
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('This browser cannot draw icon variants')
  }
  shape.draw(context, image, letter)
  return canvas.toDataURL('image/png')
}

function cover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  offset: number,
  size: number
) {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    context.drawImage(image, offset, offset, size, size)
    return
  }
  const side = Math.min(image.naturalWidth, image.naturalHeight)
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    offset,
    offset,
    size,
    size
  )
}

function tile(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  fill: string | CanvasGradient
) {
  context.fillStyle = fill
  context.beginPath()
  context.roundRect(0, 0, VARIANT_SIZE, VARIANT_SIZE, VARIANT_SIZE * 0.22)
  context.fill()
  cover(context, image, VARIANT_SIZE * 0.16, VARIANT_SIZE * 0.68)
}

function ring(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  color: string,
  dash: number[]
) {
  cover(context, image, VARIANT_SIZE * 0.15, VARIANT_SIZE * 0.7)
  context.strokeStyle = color
  context.lineWidth = VARIANT_SIZE * 0.1
  context.setLineDash(dash)
  context.beginPath()
  context.roundRect(
    VARIANT_SIZE * 0.05,
    VARIANT_SIZE * 0.05,
    VARIANT_SIZE * 0.9,
    VARIANT_SIZE * 0.9,
    VARIANT_SIZE * 0.2
  )
  context.stroke()
}

function turn(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  degrees: number,
  scale: number
) {
  context.translate(VARIANT_SIZE / 2, VARIANT_SIZE / 2)
  context.rotate((degrees * Math.PI) / 180)
  context.scale(scale, scale)
  cover(context, image, -VARIANT_SIZE / 2, VARIANT_SIZE)
}
