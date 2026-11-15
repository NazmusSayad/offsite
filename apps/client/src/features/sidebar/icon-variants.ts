import type { Color } from 'colorthief'

export const VARIANT_SIZE = 256
const MIN_CONTRAST = 2

const THEMES = [
  { label: 'Grayscale', filter: 'grayscale(1)', tint: null },
  { label: 'Dimmed', filter: 'opacity(0.55)', tint: null },
  { label: 'Dark', filter: 'brightness(0.55)', tint: null },
  { label: 'Inverted', filter: 'invert(1) hue-rotate(180deg)', tint: null },
  { label: 'Hue +120°', filter: 'hue-rotate(120deg)', tint: null },
  { label: 'Hue −120°', filter: 'hue-rotate(240deg)', tint: null },
  { label: 'Blue', filter: 'none', tint: '#3b82f6' },
  { label: 'Green', filter: 'none', tint: '#22c55e' },
  { label: 'Orange', filter: 'none', tint: '#f97316' },
  { label: 'Pink', filter: 'none', tint: '#ec4899' },
  { label: 'Sepia', filter: 'sepia(1)', tint: null },
  { label: 'Vivid', filter: 'saturate(2.5)', tint: null },
  { label: 'Hue +60°', filter: 'hue-rotate(60deg)', tint: null },
  { label: 'Hue −60°', filter: 'hue-rotate(300deg)', tint: null },
  { label: 'Purple', filter: 'none', tint: '#a855f7' },
  { label: 'Teal', filter: 'none', tint: '#14b8a6' },
  { label: 'Red', filter: 'none', tint: '#ef4444' },
  { label: 'Yellow', filter: 'none', tint: '#eab308' },
]

export type Theme = {
  label: string
  swatch: string | null
  accent: string
  tint: string | null
  filter: string
}

export type Style = {
  label: string
  draw: (
    context: CanvasRenderingContext2D,
    logo: HTMLCanvasElement,
    accent: string,
    device: HTMLImageElement
  ) => void
}

export function themes(colors: Color[]): Theme[] {
  return [
    ...colors.map((color, index) => ({
      label: `Most used ${index + 1}`,
      swatch: color.hex(),
      accent: color.hex(),
      tint: null,
      filter: 'none',
    })),
    ...THEMES.map((theme) => ({
      label: theme.label,
      swatch: theme.tint,
      accent: theme.tint ?? colors[0].hex(),
      tint: theme.tint,
      filter: theme.filter,
    })),
  ]
}

export function styles(accent: string): Style[] {
  return [
    {
      label: 'Logo',
      draw: (context, logo) => context.drawImage(logo, 0, 0),
    },
    {
      label: 'Tile',
      draw: (context, logo, color) => {
        tile(context, color)
        place(context, logo, 0.16, 0.68)
      },
    },
    ...[
      { label: 'Tile with white logo', foreground: '#ffffff' },
      { label: 'Tile with dark logo', foreground: '#18181b' },
    ]
      .filter((item) => contrast(item.foreground, accent) >= MIN_CONTRAST)
      .map((item) => ({
        label: item.label,
        draw: (
          context: CanvasRenderingContext2D,
          logo: HTMLCanvasElement,
          color: string
        ) => {
          tile(context, color)
          place(context, recolor(logo, item.foreground), 0.16, 0.68)
        },
      })),
    {
      label: 'Circle',
      draw: (context, logo, color) => {
        context.fillStyle = color
        context.beginPath()
        context.arc(
          VARIANT_SIZE / 2,
          VARIANT_SIZE / 2,
          VARIANT_SIZE / 2,
          0,
          Math.PI * 2
        )
        context.fill()
        place(context, logo, 0.2, 0.6)
      },
    },
    {
      label: 'Dark tile',
      draw: (context, logo) => {
        tile(context, '#18181b')
        place(context, logo, 0.16, 0.68)
      },
    },
  ]
}

export function logoCanvas(image: HTMLImageElement, tint: string | null) {
  const canvas = blankCanvas()
  const context = canvasContext(canvas)
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    context.drawImage(image, 0, 0, VARIANT_SIZE, VARIANT_SIZE)
  } else {
    const scale =
      VARIANT_SIZE / Math.min(image.naturalWidth, image.naturalHeight)
    const width = image.naturalWidth * scale
    const height = image.naturalHeight * scale
    context.drawImage(
      image,
      (VARIANT_SIZE - width) / 2,
      (VARIANT_SIZE - height) / 2,
      width,
      height
    )
  }
  if (tint !== null) {
    context.globalCompositeOperation = 'source-atop'
    context.globalAlpha = 0.5
    context.fillStyle = tint
    context.fillRect(0, 0, VARIANT_SIZE, VARIANT_SIZE)
  }
  return canvas
}

export function renderStyle(
  logo: HTMLCanvasElement,
  style: Style,
  theme: Theme,
  device: HTMLImageElement
) {
  const canvas = blankCanvas()
  style.draw(canvasContext(canvas), logo, theme.accent, device)
  if (theme.filter === 'none') {
    return canvas.toDataURL('image/png')
  }
  const filtered = blankCanvas()
  const context = canvasContext(filtered)
  context.filter = theme.filter
  context.drawImage(canvas, 0, 0)
  return filtered.toDataURL('image/png')
}

export function place(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  offset: number,
  size: number
) {
  context.drawImage(
    source,
    VARIANT_SIZE * offset,
    VARIANT_SIZE * offset,
    VARIANT_SIZE * size,
    VARIANT_SIZE * size
  )
}

export function tile(context: CanvasRenderingContext2D, color: string) {
  context.fillStyle = color
  context.beginPath()
  context.roundRect(0, 0, VARIANT_SIZE, VARIANT_SIZE, VARIANT_SIZE * 0.22)
  context.fill()
}

export function recolor(source: CanvasImageSource, color: string) {
  const canvas = blankCanvas()
  const context = canvasContext(canvas)
  context.drawImage(source, 0, 0, VARIANT_SIZE, VARIANT_SIZE)
  context.globalCompositeOperation = 'source-in'
  context.fillStyle = color
  context.fillRect(0, 0, VARIANT_SIZE, VARIANT_SIZE)
  return canvas
}

export function readableOn(color: string) {
  return contrast('#ffffff', color) >= contrast('#18181b', color)
    ? '#ffffff'
    : '#18181b'
}

function contrast(first: string, second: string) {
  const one = luminance(first)
  const two = luminance(second)
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05)
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function blankCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = VARIANT_SIZE
  canvas.height = VARIANT_SIZE
  return canvas
}

function canvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('This browser cannot draw icon variants')
  }
  return context
}
