import { NEEDS_PAIRING } from '@offsite/core/protocol'
import type { WebSocket } from 'ws'
import { z } from 'zod'
import { args } from '../args.ts'
import { clients } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { shareConnections } from '../services/connections.ts'
import { findDevice, isPaired, recordUse } from '../storage/auth.ts'
import { connectClient } from './socket.ts'

const LOGIN_TIMEOUT = 5000
const UNPAIR_CHECK = 5000
const log = logger.withTag('login')
const loginMessage = z.union([
  z.strictObject({ key: z.string() }),
  z.strictObject({}),
])

export function watchPaired() {
  setInterval(() => {
    for (const client of clients) {
      if (client.device !== null && !isPaired(client.device)) {
        client.socket.close()
      }
    }
  }, UNPAIR_CHECK)
}

export function logIn(socket: WebSocket, address: string) {
  const timer = setTimeout(() => socket.close(), LOGIN_TIMEOUT)
  socket.once('message', (data, isBinary) => {
    clearTimeout(timer)
    const given = isBinary ? null : readLogin(String(data))
    if (given === null) {
      log.warn(`closing a connection from ${address} that did not log in`)
      socket.close()
      return
    }
    if (!args.auth) {
      connectClient(socket, null, address)
      return
    }
    const device = 'key' in given ? findDevice(given.key) : null
    if (device === null) {
      socket.close(NEEDS_PAIRING, 'This browser needs pairing')
      return
    }
    const client = connectClient(socket, device, address)
    recordUse(device)
    shareConnections(client, device)
  })
}

function readLogin(text: string) {
  try {
    return loginMessage.parse(JSON.parse(text))
  } catch {
    return null
  }
}
