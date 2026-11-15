import {
  place,
  type Style,
  VARIANT_SIZE,
} from '@/features/sidebar/icon-variants'

const CENTER = VARIANT_SIZE / 2

export function frameStyles(): Style[] {
  return [
    {
      label: 'Ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.15, 0.7)
        square(context, color, VARIANT_SIZE * 0.09, [])
      },
    },
    {
      label: 'Thin ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.12, 0.76)
        square(context, color, VARIANT_SIZE * 0.035, [])
      },
    },
    {
      label: 'Double ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.2, 0.6)
        context.strokeStyle = color
        context.lineWidth = VARIANT_SIZE * 0.04
        for (const inset of [0.03, 0.12]) {
          context.beginPath()
          context.roundRect(
            VARIANT_SIZE * inset,
            VARIANT_SIZE * inset,
            VARIANT_SIZE * (1 - inset * 2),
            VARIANT_SIZE * (1 - inset * 2),
            VARIANT_SIZE * (0.22 - inset)
          )
          context.stroke()
        }
      },
    },
    {
      label: 'Dashed ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.15, 0.7)
        square(context, color, VARIANT_SIZE * 0.07, [
          VARIANT_SIZE * 0.1,
          VARIANT_SIZE * 0.06,
        ])
      },
    },
    {
      label: 'Dotted ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.15, 0.7)
        context.lineCap = 'round'
        square(context, color, VARIANT_SIZE * 0.07, [0, VARIANT_SIZE * 0.11])
      },
    },
    {
      label: 'Point ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.13, 0.74)
        context.lineCap = 'round'
        square(context, color, VARIANT_SIZE * 0.035, [0, VARIANT_SIZE * 0.06])
      },
    },
    {
      label: 'Circle ring',
      draw: (context, logo, color) => {
        place(context, logo, 0.22, 0.56)
        circle(context, color, VARIANT_SIZE * 0.08, [])
      },
    },
    {
      label: 'Dashed circle',
      draw: (context, logo, color) => {
        place(context, logo, 0.22, 0.56)
        circle(context, color, VARIANT_SIZE * 0.06, [
          VARIANT_SIZE * 0.09,
          VARIANT_SIZE * 0.06,
        ])
      },
    },
    {
      label: 'Dotted circle',
      draw: (context, logo, color) => {
        place(context, logo, 0.22, 0.56)
        context.lineCap = 'round'
        circle(context, color, VARIANT_SIZE * 0.07, [0, VARIANT_SIZE * 0.11])
      },
    },
    {
      label: 'Curve',
      draw: (context, logo, color) => {
        place(context, logo, 0.22, 0.56)
        context.strokeStyle = color
        context.lineWidth = VARIANT_SIZE * 0.08
        context.lineCap = 'round'
        context.beginPath()
        context.arc(
          CENTER,
          CENTER,
          VARIANT_SIZE * 0.44,
          Math.PI * 0.75,
          Math.PI * 2.25
        )
        context.stroke()
      },
    },
    {
      label: 'Wave',
      draw: (context, logo, color) => {
        place(context, logo, 0.24, 0.52)
        wave(context, VARIANT_SIZE * 0.4, VARIANT_SIZE * 0.035, 10)
        context.strokeStyle = color
        context.lineWidth = VARIANT_SIZE * 0.05
        context.stroke()
      },
    },
    {
      label: 'Scallop',
      draw: (context, logo, color) => {
        wave(context, VARIANT_SIZE * 0.45, VARIANT_SIZE * 0.04, 12)
        context.fillStyle = color
        context.fill()
        place(context, logo, 0.22, 0.56)
      },
    },
    {
      label: 'Corners',
      draw: (context, logo, color) => {
        place(context, logo, 0.15, 0.7)
        context.strokeStyle = color
        context.lineWidth = VARIANT_SIZE * 0.07
        context.lineCap = 'round'
        const near = VARIANT_SIZE * 0.06
        const far = VARIANT_SIZE * 0.94
        const arm = VARIANT_SIZE * 0.24
        for (const corner of [
          [near, near, 1, 1],
          [far, near, -1, 1],
          [near, far, 1, -1],
          [far, far, -1, -1],
        ]) {
          context.beginPath()
          context.moveTo(corner[0] + arm * corner[2], corner[1])
          context.lineTo(corner[0], corner[1])
          context.lineTo(corner[0], corner[1] + arm * corner[3])
          context.stroke()
        }
      },
    },
  ]
}

function square(
  context: CanvasRenderingContext2D,
  color: string,
  width: number,
  dash: number[]
) {
  context.strokeStyle = color
  context.lineWidth = width
  context.setLineDash(dash)
  context.beginPath()
  context.roundRect(
    width / 2,
    width / 2,
    VARIANT_SIZE - width,
    VARIANT_SIZE - width,
    VARIANT_SIZE * 0.22
  )
  context.stroke()
}

function circle(
  context: CanvasRenderingContext2D,
  color: string,
  width: number,
  dash: number[]
) {
  context.strokeStyle = color
  context.lineWidth = width
  context.setLineDash(dash)
  context.beginPath()
  context.arc(CENTER, CENTER, CENTER - width / 2, 0, Math.PI * 2)
  context.stroke()
}

function wave(
  context: CanvasRenderingContext2D,
  radius: number,
  depth: number,
  waves: number
) {
  context.beginPath()
  for (let step = 0; step <= 360; step++) {
    const angle = (step / 360) * Math.PI * 2
    const distance = radius + depth * Math.sin(angle * waves)
    const x = CENTER + distance * Math.cos(angle)
    const y = CENTER + distance * Math.sin(angle)
    if (step === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  }
  context.closePath()
}
