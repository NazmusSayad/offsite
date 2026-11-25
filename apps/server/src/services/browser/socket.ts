import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BrowserInput } from '@offsite/core/browser'
import { type WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { logger } from '../../lib/log.ts'
import { findBrowseLink } from '../files.ts'
import { attachViewer, detachViewer, receive, type Viewer } from './tabs.ts'

const log = logger.withTag('browser')
const size = {
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  scale: z.number().min(1).max(2),
}
const point = { x: z.number(), y: z.number() }
const modifiers = z.number().int().min(0).max(15)
const browserInput: z.ZodType<BrowserInput> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open'),
    page: z.string().min(1).max(100),
    url: z.string(),
    ...size,
  }),
  z.object({ type: z.literal('size'), ...size }),
  z.object({ type: z.literal('ack') }),
  z.object({
    type: z.literal('mouse'),
    action: z.enum(['down', 'up', 'move']),
    ...point,
    button: z.enum(['none', 'left', 'middle', 'right', 'back', 'forward']),
    buttons: z.number().int().min(0).max(31),
    clicks: z.number().int().min(0).max(3),
    modifiers,
  }),
  z.object({
    type: z.literal('wheel'),
    ...point,
    deltaX: z.number(),
    deltaY: z.number(),
    modifiers,
  }),
  z.object({
    type: z.literal('key'),
    action: z.enum(['down', 'up']),
    key: z.string().max(100),
    code: z.string().max(100),
    keyCode: z.number().int().min(0).max(255),
    text: z.string().max(10),
    modifiers,
  }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('probe'), ...point }),
  z.object({ type: z.literal('navigate'), url: z.string() }),
  z.object({ type: z.literal('back') }),
  z.object({ type: z.literal('forward') }),
  z.object({ type: z.literal('reload') }),
  z.object({
    type: z.literal('dialog'),
    accept: z.boolean(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('files'),
    files: z.array(
      z.object({ name: z.string(), type: z.string(), data: z.string() })
    ),
  }),
])
const sockets = new WebSocketServer({
  noServer: true,
  perMessageDeflate: false,
})

export function connectBrowser(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  const token = URL.parse(
    request.url ?? '',
    'http://localhost'
  )?.searchParams.get('token')
  const link =
    token === null || token === undefined
      ? null
      : findBrowseLink(token, request.socket.remoteAddress)
  if (link === null) {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) =>
    watch(client, link.device)
  )
}

function watch(socket: WebSocket, device: string | null) {
  const viewer: Viewer = { socket, device, sent: null, waiting: null }
  let tab: ReturnType<typeof attachViewer> | null = null
  socket.on('message', (data, isBinary) => {
    const input = isBinary ? null : read(String(data))
    if (input === null) {
      socket.close(1003, 'not a browser message')
      return
    }
    if (input.type === 'open') {
      if (tab !== null) {
        socket.close(1003, 'the page is already open')
        return
      }
      tab = attachViewer(viewer, input)
      tab.then(
        (opened) => {
          if (socket.readyState !== socket.OPEN) {
            detachViewer(opened, viewer)
          }
        },
        (error: unknown) => {
          log.warn('could not open a browser page:', error)
          socket.send(
            JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            })
          )
          socket.close(4500, 'the browser failed')
        }
      )
      return
    }
    if (tab === null) {
      socket.close(1003, 'open a page first')
      return
    }
    tab.then(
      (opened) => receive(opened, viewer, input),
      () => undefined
    )
  })
  socket.on('close', () => {
    tab?.then(
      (opened) => detachViewer(opened, viewer),
      () => undefined
    )
  })
  socket.on('error', (error) => log.warn('a browser connection failed:', error))
}

function read(text: string) {
  try {
    const parsed = browserInput.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
