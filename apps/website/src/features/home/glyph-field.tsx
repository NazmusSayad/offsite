'use client'

import { useEffect, useRef } from 'react'

const cell = 18
const ramp = ' .:-=+*%#@'
const scramble = '01<>/\\|{}[]$#@%&*+=~?!'
const colorVariables = ['--c4', '--c5', '--c6', '--c2', '--c3', '--c1']
const rippleLife = 1800

export function GlyphField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: -9999, y: -9999 }
    const ripples: { x: number; y: number; start: number }[] = []
    let width = 0
    let height = 0
    let visible = true
    let last = 0
    let frame = 0

    function resize() {
      if (!canvas || !context) return
      const ratio = window.devicePixelRatio || 1
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.textAlign = 'center'
      context.textBaseline = 'middle'
    }

    function draw(time: number) {
      if (!context) return
      const root = getComputedStyle(document.documentElement)
      const colors = colorVariables.map((name) =>
        root.getPropertyValue(name).trim()
      )
      const now = reducedMotion ? 0 : time
      const seconds = now / 1000

      context.clearRect(0, 0, width, height)
      context.font = `500 13px ${root.getPropertyValue('--font-mono')}`

      while (ripples.length > 0 && now - ripples[0].start > rippleLife) {
        ripples.shift()
      }

      const columns = Math.ceil(width / cell)
      const rows = Math.ceil(height / cell)
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = column * cell + cell / 2
          const y = row * cell + cell / 2
          const wave =
            Math.sin(column * 0.11 + seconds * 0.9) +
            Math.sin(row * 0.17 - seconds * 0.7) +
            Math.sin((column + row) * 0.07 + seconds * 0.5)
          const base = ((wave + 3) / 6) ** 2
          const glow = Math.max(
            0,
            1 - Math.hypot(x - pointer.x, y - pointer.y) / 220
          )

          let ripple = 0
          for (const item of ripples) {
            const age = now - item.start
            const ring =
              1 - Math.abs(Math.hypot(x - item.x, y - item.y) - age * 0.6) / 40
            if (ring > 0) {
              ripple = Math.max(ripple, ring * (1 - age / rippleLife))
            }
          }

          const intensity = Math.min(1, base + glow * 0.9 + ripple)
          if (intensity < 0.08) continue

          const excited = glow > 0.35 || ripple > 0.3
          const band = excited
            ? column + row + Math.floor(seconds * 6)
            : Math.floor(column * 0.04 + row * 0.02 + seconds * 0.15)
          context.globalAlpha = excited ? intensity : intensity * 0.85
          context.fillStyle = colors[band % colors.length]
          context.fillText(
            excited
              ? scramble[Math.floor(Math.random() * scramble.length)]
              : ramp[Math.floor(intensity * (ramp.length - 1))],
            x,
            y
          )
        }
      }
      context.globalAlpha = 1
    }

    function loop(time: number) {
      frame = requestAnimationFrame(loop)
      if (!visible || document.hidden || time - last < 33) return
      last = time
      draw(time)
    }

    function handlePointerMove(event: PointerEvent) {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }

    function handlePointerDown(event: PointerEvent) {
      if (!canvas || reducedMotion) return
      const rect = canvas.getBoundingClientRect()
      if (event.clientY > rect.bottom) return
      ripples.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        start: performance.now(),
      })
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting
    })
    intersectionObserver.observe(canvas)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerdown', handlePointerDown)
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 size-full [mask-image:radial-gradient(ellipse_110%_40%_at_50%_42%,rgb(0_0_0/0.1)_55%,black_100%)] md:[mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,rgb(0_0_0/0.25)_20%,black_85%)]"
    />
  )
}
