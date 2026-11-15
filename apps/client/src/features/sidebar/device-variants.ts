import {
  place,
  readableOn,
  recolor,
  type Style,
  tile,
  VARIANT_SIZE,
} from '@/features/sidebar/icon-variants'

const BADGE_FILL = '#27272a'
const BADGE_GLYPH = '#e4e4e7'
const GAP = 0.045

export function deviceStyles(): Style[] {
  return [
    {
      label: 'Device badge',
      draw: (context, logo, _color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.77, 0.77, 0.2], BADGE_FILL, BADGE_GLYPH)
      },
    },
    {
      label: 'Color device badge',
      draw: (context, logo, color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.77, 0.77, 0.2], color, readableOn(color))
      },
    },
    {
      label: 'Top device badge',
      draw: (context, logo, _color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.77, 0.23, 0.2], BADGE_FILL, BADGE_GLYPH)
      },
    },
    {
      label: 'Left device badge',
      draw: (context, logo, _color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.23, 0.77, 0.2], BADGE_FILL, BADGE_GLYPH)
      },
    },
    {
      label: 'Small device badge',
      draw: (context, logo, color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.82, 0.82, 0.15], color, readableOn(color))
      },
    },
    {
      label: 'Device mark',
      draw: (context, logo, color, device) => {
        context.drawImage(logo, 0, 0)
        badge(context, device, [0.77, 0.77, 0.2], null, color)
      },
    },
    {
      label: 'Square device badge',
      draw: (context, logo, _color, device) => {
        context.drawImage(logo, 0, 0)
        const start = VARIANT_SIZE * 0.56
        const size = VARIANT_SIZE * 0.44
        const gap = VARIANT_SIZE * GAP
        context.globalCompositeOperation = 'destination-out'
        context.beginPath()
        context.roundRect(
          start - gap,
          start - gap,
          size + gap * 2,
          size + gap * 2,
          VARIANT_SIZE * 0.14
        )
        context.fill()
        context.globalCompositeOperation = 'source-over'
        context.fillStyle = BADGE_FILL
        context.beginPath()
        context.roundRect(start, start, size, size, VARIANT_SIZE * 0.11)
        context.fill()
        glyph(context, device, BADGE_GLYPH, [0.78, 0.78, 0.26])
      },
    },
    {
      label: 'Tile with device badge',
      draw: (context, logo, color, device) => {
        tile(context, color)
        place(context, logo, 0.14, 0.6)
        badge(context, device, [0.77, 0.77, 0.2], BADGE_FILL, BADGE_GLYPH)
      },
    },
  ]
}

function badge(
  context: CanvasRenderingContext2D,
  device: HTMLImageElement,
  spot: [number, number, number],
  fill: string | null,
  glyphColor: string
) {
  const x = VARIANT_SIZE * spot[0]
  const y = VARIANT_SIZE * spot[1]
  const radius = VARIANT_SIZE * spot[2]
  context.globalCompositeOperation = 'destination-out'
  context.beginPath()
  context.arc(x, y, radius + VARIANT_SIZE * GAP, 0, Math.PI * 2)
  context.fill()
  context.globalCompositeOperation = 'source-over'
  if (fill !== null) {
    context.fillStyle = fill
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }
  glyph(context, device, glyphColor, [spot[0], spot[1], spot[2] * 1.2])
}

function glyph(
  context: CanvasRenderingContext2D,
  device: HTMLImageElement,
  color: string,
  spot: [number, number, number]
) {
  const size = VARIANT_SIZE * spot[2]
  context.drawImage(
    recolor(device, color),
    VARIANT_SIZE * spot[0] - size / 2,
    VARIANT_SIZE * spot[1] - size / 2,
    size,
    size
  )
}
