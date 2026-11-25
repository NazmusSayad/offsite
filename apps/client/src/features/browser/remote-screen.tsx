import type { BrowserDialog, BrowserInput } from '@offsite/core/browser'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import type { RemoteBrowser } from '@/features/browser/use-remote-browser'

type Wheel = Omit<Extract<BrowserInput, { type: 'wheel' }>, 'type'>
type Touch = { id: number; x: number; y: number; panning: boolean }

const BUTTONS = ['left', 'middle', 'right', 'back', 'forward'] as const
const CLICK_TIME = 500
const CLICK_DISTANCE = 5
const PAN_DISTANCE = 8
const SENTINEL = '\u200b'

export function RemoteScreen(props: { remote: RemoteBrowser; url: string }) {
  const remote = props.remote
  const send = remote.send
  const keys = remote.keys
  const touch = useRef<Touch | null>(null)
  const lastClick = useRef({ time: 0, x: 0, y: 0, button: -1, count: 0 })
  const queued = useRef<{
    move: BrowserInput | null
    wheel: Wheel | null
    frame: number | null
  }>({ move: null, wheel: null, frame: null })

  function flush() {
    const next = queued.current
    if (next.frame !== null) {
      cancelAnimationFrame(next.frame)
      next.frame = null
    }
    if (next.move !== null) {
      send(next.move)
      next.move = null
    }
    if (next.wheel !== null) {
      send({ type: 'wheel', ...next.wheel })
      next.wheel = null
    }
  }

  function later() {
    const next = queued.current
    if (next.frame === null) {
      next.frame = requestAnimationFrame(() => {
        next.frame = null
        flush()
      })
    }
  }

  function scroll(wheel: Wheel) {
    const next = queued.current
    next.wheel = {
      ...wheel,
      deltaX: (next.wheel?.deltaX ?? 0) + wheel.deltaX,
      deltaY: (next.wheel?.deltaY ?? 0) + wheel.deltaY,
    }
    later()
  }

  function tap(point: { x: number; y: number }) {
    flush()
    const press = { ...point, modifiers: 0, clicks: 1 }
    send({
      type: 'mouse',
      action: 'move',
      button: 'none',
      buttons: 0,
      ...press,
    })
    send({
      type: 'mouse',
      action: 'down',
      button: 'left',
      buttons: 1,
      ...press,
    })
    send({ type: 'mouse', action: 'up', button: 'left', buttons: 0, ...press })
    remote.tapped()
  }

  function countClicks(event: PointerEvent<HTMLDivElement>) {
    const last = lastClick.current
    const again =
      event.button === last.button &&
      event.timeStamp - last.time < CLICK_TIME &&
      Math.abs(event.clientX - last.x) < CLICK_DISTANCE &&
      Math.abs(event.clientY - last.y) < CLICK_DISTANCE
    lastClick.current = {
      time: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
      button: event.button,
      count: again ? Math.min(last.count + 1, 3) : 1,
    }
    return lastClick.current.count
  }

  function typeText(area: HTMLTextAreaElement) {
    const text = area.value.replaceAll(SENTINEL, '')
    if (text !== '') {
      send({ type: 'text', text })
    }
    area.value = SENTINEL
  }

  useEffect(() => {
    const element = remote.screen.current
    if (element === null) {
      return
    }
    function wheel(event: WheelEvent) {
      if (element === null) {
        return
      }
      event.preventDefault()
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? element.clientHeight
            : 1
      scroll({
        ...pointOf(event, element),
        deltaX: event.deltaX * unit,
        deltaY: event.deltaY * unit,
        modifiers: modifiersOf(event),
      })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  })

  return (
    <>
      <div
        ref={remote.screen}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-white select-none"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = pointOf(event, event.currentTarget)
          if (event.pointerType === 'touch') {
            if (touch.current === null) {
              touch.current = { id: event.pointerId, ...point, panning: false }
              remote.probe(point)
            }
            return
          }
          event.preventDefault()
          keys.current?.focus({ preventScroll: true })
          const button = BUTTONS[event.button]
          if (
            button === undefined ||
            button === 'back' ||
            button === 'forward'
          ) {
            return
          }
          flush()
          send({
            type: 'mouse',
            action: 'down',
            ...point,
            button,
            buttons: event.buttons,
            clicks: countClicks(event),
            modifiers: modifiersOf(event),
          })
        }}
        onPointerMove={(event) => {
          const point = pointOf(event, event.currentTarget)
          const finger = touch.current
          if (event.pointerType === 'touch') {
            if (finger === null || finger.id !== event.pointerId) {
              return
            }
            if (
              !finger.panning &&
              Math.hypot(point.x - finger.x, point.y - finger.y) < PAN_DISTANCE
            ) {
              return
            }
            scroll({
              ...point,
              deltaX: finger.x - point.x,
              deltaY: finger.y - point.y,
              modifiers: 0,
            })
            touch.current = { ...finger, ...point, panning: true }
            return
          }
          queued.current.move = {
            type: 'mouse',
            action: 'move',
            ...point,
            button: pressedButton(event.buttons),
            buttons: event.buttons,
            clicks: 0,
            modifiers: modifiersOf(event),
          }
          later()
        }}
        onPointerUp={(event) => {
          const point = pointOf(event, event.currentTarget)
          if (event.pointerType === 'touch') {
            const finger = touch.current
            if (finger === null || finger.id !== event.pointerId) {
              return
            }
            touch.current = null
            if (!finger.panning) {
              tap(point)
            }
            return
          }
          const button = BUTTONS[event.button]
          if (button === 'back' || button === 'forward') {
            event.preventDefault()
            send({ type: button })
            return
          }
          if (button === undefined) {
            return
          }
          flush()
          send({
            type: 'mouse',
            action: 'up',
            ...point,
            button,
            buttons: event.buttons,
            clicks: lastClick.current.count,
            modifiers: modifiersOf(event),
          })
        }}
        onPointerCancel={() => {
          touch.current = null
        }}
      >
        <canvas
          ref={remote.canvas}
          className="absolute top-0 left-0"
          style={
            remote.viewport === null
              ? { width: 0, height: 0 }
              : { width: remote.viewport.width, height: remote.viewport.height }
          }
        />
        <textarea
          ref={keys}
          className="sr-only"
          aria-label="Page"
          defaultValue={SENTINEL}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              return
            }
            if (isPaste(event)) {
              return
            }
            event.preventDefault()
            send({
              type: 'key',
              action: 'down',
              key: event.key,
              code: event.code,
              keyCode: event.keyCode,
              text: keyText(event),
              modifiers: modifiersOf(event),
            })
          }}
          onKeyUp={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              return
            }
            if (isPaste(event)) {
              return
            }
            event.preventDefault()
            send({
              type: 'key',
              action: 'up',
              key: event.key,
              code: event.code,
              keyCode: event.keyCode,
              text: '',
              modifiers: modifiersOf(event),
            })
          }}
          onInput={(event) => {
            const native = event.nativeEvent
            if (!(native instanceof InputEvent) || native.isComposing) {
              return
            }
            if (native.inputType === 'deleteContentBackward') {
              const backspace = {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                text: '',
                modifiers: 0,
              }
              send({ type: 'key', action: 'down', ...backspace })
              send({ type: 'key', action: 'up', ...backspace })
              event.currentTarget.value = SENTINEL
              return
            }
            typeText(event.currentTarget)
          }}
          onCompositionEnd={(event) => typeText(event.currentTarget)}
          onPaste={(event) => {
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            if (text !== '') {
              send({ type: 'text', text })
            }
          }}
        />
        {remote.installing && (
          <p className="text-muted-foreground bg-background absolute inset-0 flex items-center justify-center p-4 text-center text-xs">
            Installing the browser
          </p>
        )}
      </div>
      <AlertDialog
        open={remote.dialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            send({ type: 'dialog', accept: false, text: '' })
          }
        }}
      >
        <AlertDialogContent
          focus="action"
          onOpenAutoFocus={(event) => {
            if (!(event.currentTarget instanceof HTMLElement)) {
              throw new Error('Alert dialog content is not an element')
            }
            const answer = event.currentTarget.querySelector('input')
            if (answer !== null) {
              event.preventDefault()
              answer.focus({ preventScroll: true })
            }
          }}
        >
          {remote.dialog !== null && (
            <PageDialog
              dialog={remote.dialog}
              url={props.url}
              onAccept={(text) => send({ type: 'dialog', accept: true, text })}
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function PageDialog(props: {
  dialog: BrowserDialog
  url: string
  onAccept: (text: string) => void
}) {
  const [text, setText] = useState(props.dialog.value)
  const leaving = props.dialog.kind === 'beforeunload'
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {leaving
            ? 'Leave site?'
            : `${URL.parse(props.url)?.host ?? 'This page'} says`}
        </AlertDialogTitle>
        <AlertDialogDescription className="wrap-anywhere whitespace-pre-wrap">
          {leaving
            ? 'Changes you made may not be saved.'
            : props.dialog.message}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {props.dialog.kind === 'prompt' && (
        <Input
          aria-label="Answer"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              props.onAccept(text)
            }
          }}
        />
      )}
      <AlertDialogFooter>
        {props.dialog.kind !== 'alert' && (
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        )}
        <AlertDialogAction
          onClick={(event) => {
            event.preventDefault()
            props.onAccept(text)
          }}
        >
          {leaving ? 'Leave' : 'OK'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function pointOf(
  event: { clientX: number; clientY: number },
  element: Element
) {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function modifiersOf(event: {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}) {
  return (
    (event.altKey ? 1 : 0) |
    (event.ctrlKey ? 2 : 0) |
    (event.metaKey ? 4 : 0) |
    (event.shiftKey ? 8 : 0)
  )
}

function pressedButton(buttons: number) {
  if ((buttons & 1) !== 0) {
    return 'left'
  }
  if ((buttons & 2) !== 0) {
    return 'right'
  }
  if ((buttons & 4) !== 0) {
    return 'middle'
  }
  return 'none'
}

function isPaste(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}) {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    event.key.toLowerCase() === 'v'
  )
}

function keyText(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}) {
  if (event.metaKey || (event.ctrlKey && !event.altKey)) {
    return ''
  }
  if (event.key === 'Enter') {
    return '\r'
  }
  return [...event.key].length === 1 ? event.key : ''
}
