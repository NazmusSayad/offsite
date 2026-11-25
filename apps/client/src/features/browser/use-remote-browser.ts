import type {
  BrowserDialog,
  BrowserInput,
  BrowserOutput,
} from '@offsite/core/browser'
import { useCallback, useEffect, useRef, useState } from 'react'
import { call, machineUrl } from '@/api/connection'
import { readBase64, UPLOAD_LIMIT } from '@/api/upload'
import { downloadFile } from '@/lib/media'
import { showError } from '@/lib/store'
import { replaceSearch } from '@/lib/url'
import { errorMessage } from '@/lib/utils'

export type RemoteBrowser = ReturnType<typeof useRemoteBrowser>

const RECONNECT_DELAY = 1000
const RESIZE_DELAY = 100
const MAX_SCALE = 2
const pageIds = new Map<string, string>()

export function useRemoteBrowser(
  machine: string,
  target: string | null,
  version: number
) {
  const [page, setPage] = useState<Extract<
    BrowserOutput,
    { type: 'state' }
  > | null>(null)
  const [viewport, setViewport] = useState<{
    width: number
    height: number
  } | null>(null)
  const [dialog, setDialog] = useState<BrowserDialog | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const keys = useRef<HTMLTextAreaElement>(null)
  const probing = useRef<{ editable: boolean | null; tapped: boolean }>({
    editable: null,
    tapped: false,
  })
  const reported = useRef<string | null>(null)
  const latest = useRef(target)
  latest.current = target
  const enabled = target !== null

  const send = useCallback((input: BrowserInput) => {
    const open = socket.current
    if (open !== null && open.readyState === WebSocket.OPEN) {
      open.send(JSON.stringify(input))
    }
  }, [])

  const probe = useCallback(
    (point: { x: number; y: number }) => {
      probing.current = { editable: null, tapped: false }
      send({ type: 'probe', ...point })
    },
    [send]
  )

  const tapped = useCallback(() => {
    const current = probing.current
    if (current.editable === null) {
      current.tapped = true
      return
    }
    focusKeys(keys.current, current.editable)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let current: WebSocket | null = null
    let drawing = false
    let queued: Blob | null = null

    async function draw(blob: Blob) {
      queued = blob
      if (drawing) {
        return
      }
      drawing = true
      try {
        while (queued !== null) {
          const blob = queued
          queued = null
          const image = await createImageBitmap(blob)
          const element = canvas.current
          if (element !== null) {
            if (element.width !== image.width) {
              element.width = image.width
            }
            if (element.height !== image.height) {
              element.height = image.height
            }
            element.getContext('2d')?.drawImage(image, 0, 0)
          }
          image.close()
        }
      } finally {
        drawing = false
      }
    }

    function receive(message: BrowserOutput) {
      if (message.type === 'state') {
        setPage(message)
        setInstalling(false)
        if (message.url !== '') {
          reported.current = message.url
          if (message.url !== latest.current) {
            replaceSearch({ browse: message.url })
          }
        }
        return
      }
      if (message.type === 'viewport') {
        setViewport({ width: message.width, height: message.height })
        return
      }
      if (message.type === 'dialog') {
        setDialog(message.dialog)
        return
      }
      if (message.type === 'probe') {
        const current = probing.current
        current.editable = message.editable
        if (current.tapped) {
          current.tapped = false
          focusKeys(keys.current, message.editable)
        }
        return
      }
      if (message.type === 'copy') {
        if (!window.isSecureContext) {
          showError(new Error('Copying needs https or localhost'))
          return
        }
        navigator.clipboard.writeText(message.text).catch(showError)
        return
      }
      if (message.type === 'files') {
        chooseFiles(message, send)
        return
      }
      if (message.type === 'download') {
        downloadFile(
          `${machineUrl(machine)}/api/media?${new URLSearchParams({ token: message.token })}`,
          message.name
        ).catch(showError)
        return
      }
      if (message.type === 'installing') {
        setInstalling(true)
        return
      }
      if (message.type === 'error') {
        setError(message.message)
        return
      }
      throw new Error(`unknown browser message ${JSON.stringify(message)}`)
    }

    async function connect() {
      const token = await call(machine, 'files.browse', undefined)
      if (stopped) {
        return
      }
      const next = new WebSocket(
        `${machineUrl(machine).replace(/^http/, 'ws')}/api/browser?${new URLSearchParams({ token })}`
      )
      next.binaryType = 'blob'
      current = next
      next.onopen = () => {
        const url = latest.current
        if (url === null) {
          throw new Error('the browser connected without an address')
        }
        socket.current = next
        let id = pageIds.get(machine)
        if (id === undefined) {
          id = crypto.randomUUID()
          pageIds.set(machine, id)
        }
        send({ type: 'open', page: id, url, ...measure(screen.current) })
      }
      next.onmessage = (event: MessageEvent<Blob | string>) => {
        if (stopped) {
          return
        }
        if (typeof event.data === 'string') {
          receive(JSON.parse(event.data) as BrowserOutput)
          return
        }
        next.send(JSON.stringify({ type: 'ack' }))
        draw(event.data).catch(showError)
      }
      next.onclose = (event) => {
        if (socket.current === next) {
          socket.current = null
        }
        if (stopped || event.code === 4000 || event.code === 4500) {
          return
        }
        retry = setTimeout(start, RECONNECT_DELAY)
      }
    }

    function start() {
      connect().catch((caught: unknown) => {
        if (stopped) {
          return
        }
        setError(errorMessage(caught))
        retry = setTimeout(start, RECONNECT_DELAY)
      })
    }

    setError(null)
    start()
    return () => {
      stopped = true
      if (retry !== null) {
        clearTimeout(retry)
      }
      current?.close()
      socket.current = null
    }
  }, [machine, enabled, version, send])

  useEffect(() => {
    if (
      target !== null &&
      reported.current !== null &&
      target !== reported.current
    ) {
      send({ type: 'navigate', url: target })
    }
  }, [target, send])

  useEffect(() => {
    const element = screen.current
    if (!enabled || element === null) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (timer !== null) {
        clearTimeout(timer)
      }
      timer = setTimeout(
        () => send({ type: 'size', ...measure(element) }),
        RESIZE_DELAY
      )
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [enabled, send])

  return {
    page,
    viewport,
    dialog,
    installing,
    error,
    canvas,
    screen,
    keys,
    send,
    probe,
    tapped,
  }
}

function focusKeys(element: HTMLTextAreaElement | null, editable: boolean) {
  if (editable) {
    element?.focus({ preventScroll: true })
    return
  }
  element?.blur()
}

function measure(element: HTMLElement | null) {
  const rect = element?.getBoundingClientRect()
  return {
    width: Math.max(1, Math.round(rect?.width ?? 0)),
    height: Math.max(1, Math.round(rect?.height ?? 0)),
    scale: Math.min(MAX_SCALE, Math.max(1, window.devicePixelRatio)),
  }
}

function chooseFiles(
  request: Extract<BrowserOutput, { type: 'files' }>,
  send: (input: BrowserInput) => void
) {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = request.multiple
  input.accept = request.accept
  input.addEventListener('cancel', () => send({ type: 'files', files: [] }))
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    if (files.reduce((total, file) => total + file.size, 0) > UPLOAD_LIMIT) {
      send({ type: 'files', files: [] })
      showError(new Error('The files are larger than 50 MB'))
      return
    }
    Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        data: await readBase64(file),
      }))
    ).then((read) => send({ type: 'files', files: read }), showError)
  })
  input.click()
}
