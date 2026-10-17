import type { ServerEvent, ServerMessage } from '@offsite/core/protocol'
import type { WebSocket } from 'ws'

export type Client = {
  socket: WebSocket
  heardAt: number
  opening: string | null
  sessionId: string | null
  send: (message: ServerMessage) => void
}

export const clients = new Set<Client>()

export function publish(sessionId: string, event: ServerEvent) {
  for (const client of clients) {
    if (client.sessionId === sessionId) {client.send(event)}
  }
}

export function broadcast(event: ServerEvent) {
  for (const client of clients) {
    client.send(event)
  }
}
