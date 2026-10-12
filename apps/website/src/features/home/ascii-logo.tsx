'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const columns = 72
const rows = 34

const handle =
  'M17 15 V12.5 C17 10 18.5 8.5 21 8.5 H27 C29.5 8.5 31 10 31 12.5 V15'
const body =
  'M12 15 H36 A7 7 0 0 1 43 22 V34 A7 7 0 0 1 36 41 H12 A7 7 0 0 1 5 34 V22 A7 7 0 0 1 12 15 Z M21.5 20 H33.5 A3.5 3.5 0 0 1 33.5 27 H21.5 A3.5 3.5 0 0 1 21.5 20 Z M14.5 29 H26.5 A3.5 3.5 0 0 1 26.5 36 H14.5 A3.5 3.5 0 0 1 14.5 29 Z'

const output = [
  '$ npm run dev',
  'ready in 412ms',
  '+ compiled /app/page in 212ms',
  'GET / 200 in 31ms',
  '$ claude',
  '* reading src/app/page.tsx',
  '* editing src/features/home/hero.tsx',
  '+ 3 files changed, 41 insertions',
  '$ git log --oneline',
  '9d5bf00 fix a shell restart loop',
  '8be7f6b keep a group and a terminal open',
  '3abef11 run sshtty as one process',
  '$ cargo build --release',
  'compiling sshtty v0.0.10',
  'finished release in 41.2s',
  '$ tail -f server.log',
  'GET /api/health 200 2ms',
  'POST /api/session 201 14ms',
  'GET /api/health 200 1ms',
].join(' :: ')

function measureCoverage() {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Canvas 2D is not available')
  const handlePath = new Path2D(handle)
  const bodyPath = new Path2D(body)
  context.lineWidth = 4.5
  context.lineCap = 'round'
  const coverage = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let hits = 0
      for (const offsetX of [0.25, 0.75]) {
        for (const offsetY of [0.25, 0.75]) {
          const x = -2 + ((column + offsetX) / columns) * 52
          const y = 0.2 + ((row + offsetY) / rows) * 49.1
          if (
            context.isPointInPath(bodyPath, x, y, 'evenodd') ||
            context.isPointInStroke(handlePath, x, y)
          ) {
            hits++
          }
        }
      }
      coverage.push(hits / 4)
    }
  }
  return coverage
}

export function AsciiLogo(props: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) throw new Error('The canvas is not mounted')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is not available')
    const coverage = measureCoverage()
    let offset = 0

    function draw() {
      if (!canvas || !context) return
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      const style = getComputedStyle(canvas)
      const cellWidth = rect.width / columns
      const cellHeight = rect.height / rows
      context.font = `600 ${cellWidth / 0.6}px ${style.fontFamily}`
      context.textBaseline = 'middle'
      context.textAlign = 'center'

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const cellCoverage = coverage[row * columns + column]
          const character =
            output[((row + offset) * columns + column) % output.length]
          if (cellCoverage === 0) {
            const distanceX = ((column + 0.5) / columns) * 2 - 1
            const distanceY = ((row + 0.5) / rows) * 2 - 1
            context.globalAlpha =
              0.16 *
              Math.max(0, 1 - distanceX * distanceX - distanceY * distanceY)
            context.fillStyle = style.getPropertyValue('--text')
          } else {
            context.globalAlpha = cellCoverage * 0.92
            context.fillStyle = style.getPropertyValue('--c4')
            context.fillRect(
              column * cellWidth,
              row * cellHeight,
              cellWidth,
              cellHeight
            )
            context.globalAlpha = cellCoverage * 0.8
            context.fillStyle = style.getPropertyValue('--background')
          }
          context.fillText(
            character === ' ' ? '.' : character,
            (column + 0.5) * cellWidth,
            (row + 0.5) * cellHeight
          )
        }
      }
      offset++
    }

    draw()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = setInterval(draw, 160)
    return () => clearInterval(interval)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        'aspect-[36/34] w-full font-mono drop-shadow-[0_0_40px_color-mix(in_srgb,var(--c4)_30%,transparent)]',
        props.className
      )}
    />
  )
}
