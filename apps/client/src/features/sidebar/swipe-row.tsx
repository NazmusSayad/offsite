import { useRef, useState } from 'react'
import type { MachineSession } from '@/lib/store'
import { SwipeBackground } from './swipe-background'

export function SwipeRow(props: {
  status: MachineSession['status']
  enabled: boolean
  onSwipe: (dx: number, status: MachineSession['status']) => void
  children: React.ReactNode
}) {
  const [offset, setOffset] = useState(0)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [released, setReleased] = useState<{
    offset: number
    status: MachineSession['status']
  } | null>(null)
  const swipe = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const swiped = useRef(false)
  const moving = offset !== 0 || released !== null

  function release(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipe.current
    swipe.current = null
    if (start === null || !start.swiping) {
      setOffset(0)
      return
    }
    swiped.current = true
    const dx = event.clientX - start.x
    if (dx === 0) {
      setOffset(0)
      return
    }
    const status = props.status
    const committed = Math.abs(dx) > height
    const animation = committed
      ? event.currentTarget.animate(
          [
            { transform: `translateX(${dx}px)` },
            { transform: `translateX(${Math.sign(dx) * width}px)` },
          ],
          { duration: 100, easing: 'ease-out', fill: 'forwards' }
        )
      : event.currentTarget.animate(
          [
            {
              transform: `translateX(${dx}px)`,
              easing: 'cubic-bezier(.25,.6,.8,.8)',
            },
            {
              transform: 'translateX(0)',
              offset: 0.55,
              easing: 'cubic-bezier(.2,.6,.4,1)',
            },
            {
              transform: `translateX(${dx * 0.07}px)`,
              offset: 0.78,
              easing: 'ease-in-out',
            },
            { transform: 'translateX(0)' },
          ],
          { duration: 360 }
        )
    setReleased({ offset: dx, status })
    setOffset(0)
    animation.onfinish = () => {
      animation.cancel()
      setReleased(null)
      if (committed) {
        props.onSwipe(dx, status)
      }
    }
  }

  return (
    <div className="relative overflow-hidden rounded-md">
      {moving && (
        <SwipeBackground
          status={released === null ? props.status : released.status}
          offset={released === null ? offset : released.offset}
          threshold={height}
          className="inset-0"
        />
      )}
      <div
        data-swiping={moving ? '' : undefined}
        style={moving ? { transform: `translateX(${offset}px)` } : undefined}
        onClickCapture={(event) => {
          if (swiped.current) {
            swiped.current = false
            event.stopPropagation()
          }
        }}
        onPointerDown={(event) => {
          if (
            !props.enabled ||
            event.pointerType !== 'touch' ||
            released !== null
          ) {
            return
          }
          swiped.current = false
          setWidth(event.currentTarget.offsetWidth)
          setHeight(event.currentTarget.offsetHeight)
          swipe.current = {
            x: event.clientX,
            y: event.clientY,
            swiping: false,
          }
        }}
        onPointerMove={(event) => {
          const start = swipe.current
          if (start === null) {
            return
          }
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (!start.swiping && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
            return
          }
          if (!start.swiping && Math.abs(dx) <= Math.abs(dy)) {
            swipe.current = null
            return
          }
          start.swiping = true
          setOffset(dx)
        }}
        onPointerUp={release}
        onPointerCancel={() => {
          swipe.current = null
          setOffset(0)
        }}
      >
        {props.children}
      </div>
    </div>
  )
}
