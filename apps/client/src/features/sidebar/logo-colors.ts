import { type Color, getPaletteSync } from 'colorthief'

const COLOR_SAMPLE_SIZE = 256
const MAX_COLORS = 3
const MIN_COLOR_SHARE = 0.05
const MIN_COLOR_DISTANCE = 64

export function logoColors(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = COLOR_SAMPLE_SIZE
  canvas.height = COLOR_SAMPLE_SIZE
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('This browser cannot read icon colors')
  }
  context.drawImage(image, 0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE)
  const palette = getPaletteSync(canvas, {
    colorCount: 8,
    quality: 1,
    ignoreWhite: false,
  })
  if (palette === null) {
    throw new Error('This icon has no visible colors')
  }
  const colors: Color[] = []
  for (const color of palette.sort((a, b) => b.proportion - a.proportion)) {
    if (
      colors.length < MAX_COLORS &&
      color.proportion >= MIN_COLOR_SHARE &&
      colors.every((kept) => colorDistance(kept, color) >= MIN_COLOR_DISTANCE)
    ) {
      colors.push(color)
    }
  }
  return colors
}

function colorDistance(first: Color, second: Color) {
  const one = first.array()
  const two = second.array()
  return Math.hypot(one[0] - two[0], one[1] - two[1], one[2] - two[2])
}
