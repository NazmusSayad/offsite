'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { logoBody, logoHandle } from './logo'

const columns = 90
const rows = 42
const text = 'npx sshtty '

function measureCoverage() {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Canvas 2D is not available')
  const handlePath = new Path2D(logoHandle)
  const bodyPath = new Path2D(logoBody)
  context.lineWidth = 4.5
  context.lineCap = 'round'
  const coverage = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let hits = 0
      for (const offsetX of [0.25, 0.75]) {
        for (const offsetY of [0.25, 0.75]) {
          const x = -2 + ((column + offsetX) / columns) * 52
          const y = 0.5 + ((row + offsetY) / rows) * 48.5
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
    let width = 0
    let height = 0
    let style = getComputedStyle(canvas)
    let interval: ReturnType<typeof setInterval> | undefined

    function draw() {
      if (!canvas || !context || width === 0) return
      const cellWidth = width / columns
      const cellHeight = height / rows
      context.clearRect(0, 0, width, height)
      context.font = `600 ${cellWidth / 0.6}px ${style.fontFamily}`
      context.textBaseline = 'middle'
      context.textAlign = 'center'

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const cellCoverage = coverage[row * columns + column]
          const character =
            text[(row * columns + column + offset) % text.length]
          if (cellCoverage === 0) {
            const distanceX = ((column + 0.5) / columns) * 2 - 1
            const distanceY = ((row + 0.5) / rows) * 2 - 1
            context.globalAlpha =
              0.2 *
              Math.max(0, 1 - distanceX * distanceX - distanceY * distanceY)
            context.fillStyle = style.getPropertyValue('--text')
          } else {
            context.globalAlpha = cellCoverage
            context.fillStyle = style.getPropertyValue('--c4')
            context.fillRect(
              column * cellWidth,
              row * cellHeight,
              cellWidth + 0.5,
              cellHeight + 0.5
            )
            context.globalAlpha = cellCoverage * 0.35
            context.fillStyle = style.getPropertyValue('--bg')
          }
          if (character !== ' ') {
            context.fillText(
              character,
              (column + 0.5) * cellWidth,
              (row + 0.5) * cellHeight
            )
          }
        }
      }
      offset++
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      const ratio = window.devicePixelRatio
      width = rect.width
      height = rect.height
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw()
    })
    resizeObserver.observe(canvas)

    const styleObserver = new MutationObserver(() => {
      style = getComputedStyle(canvas)
      draw()
    })
    styleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const visibilityObserver = new IntersectionObserver((entries) => {
      clearInterval(interval)
      interval = undefined
      if (entries[0].isIntersecting && !reducedMotion.matches) {
        interval = setInterval(draw, 160)
      }
    })
    visibilityObserver.observe(canvas)

    return () => {
      clearInterval(interval)
      resizeObserver.disconnect()
      styleObserver.disconnect()
      visibilityObserver.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        'aspect-[45/42] w-full font-mono drop-shadow-[0_0_40px_color-mix(in_srgb,var(--c4)_30%,transparent)]',
        props.className
      )}
    />
  )
}
