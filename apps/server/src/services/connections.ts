import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import { consola } from 'consola'
import { z } from 'zod'
import { type Client, clients } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import {
  addDevice,
  findDevice,
  hash,
  isPaired,
  readDevices,
  removeDevices,
} from '../storage/auth.ts'
import {
  latestIssuedKey,
  readConnections,
  readIssuedKeys,
  removeConnection,
  removeExpiredIssuedKeys,
  removeIssuedKeys,
  saveConnection,
  saveIssuedKey,
} from '../storage/connections.ts'

const RENEW_BEFORE = 7 * 24 * 60 * 60_000
const CHECK_INTERVAL = 60_000
const REQUEST_TIMEOUT = 10_000
const log = logger.withTag('connections')
const issuing = new Set<string>()
const issuedReply = z.object({ token: z.string(), expiresAt: z.number() })

type Connection = ReturnType<typeof readConnections>[number]

export async function addConnection(connection: {
  address: string
  code: string
}) {
  let response
  try {
    response = await fetch(`${connection.address}/api/pair`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.code}` },
    })
  } catch (error) {
    console.error(`Could not reach ${connection.address}: ${String(error)}`)
    process.exit(1)
  }
  if (!response.ok) {
    console.error(
      `${connection.address} did not connect: ${await response.text()}`
    )
    process.exit(1)
  }
  const reply = issuedReply.parse(await response.json())
  saveConnection(connection.address, reply.token)
  console.log(
    `Connected to ${connection.address} until ${new Date(reply.expiresAt).toLocaleString()}; browsers paired with this machine get it within a minute`
  )
}

export async function removeConnections() {
  const saved = readConnections()
  if (saved.length === 0) {
    console.log('No machines are connected')
    return
  }
  if (!process.stdin.isTTY) {
    console.error('offsite connect remove needs an interactive terminal')
    process.exit(1)
  }
  const picked = (await consola.prompt('Which machines should be removed?', {
    type: 'multiselect',
    required: false,
    cancel: 'null',
    options: saved.map((item) => ({
      value: item.address,
      label: `${item.address} · connected ${new Date(item.createdAt).toLocaleString()}`,
    })),
  })) as unknown as string[] | null
  if (picked === null || picked.length === 0) {
    console.log('Nothing removed')
    return
  }
  for (const connection of saved) {
    if (!picked.includes(connection.address)) {
      continue
    }
    const keys = [
      connection.key,
      ...readIssuedKeys(connection.address).map((item) => item.key),
    ]
    const removed = await requestMachine(
      connection,
      '/api/keys/remove',
      keys.map(hash)
    )
    removeConnection(connection.address)
    if (removed === null) {
      console.warn(
        `Removed ${connection.address} here, but couldn't reach it, so it accepts the keys it gave out until they expire. Run offsite unpair there to remove them now.`
      )
      continue
    }
    console.log(`Removed ${connection.address}`)
  }
}

export function answerKeys(
  pathname: string,
  given: string | null,
  request: IncomingMessage,
  response: ServerResponse
) {
  const caller = given === null ? null : findDevice(given)
  if (caller === null) {
    response.statusCode = 401
    response.end('This machine needs pairing')
    return
  }
  if (pathname === '/api/keys/issue') {
    void answerIssue(caller, request, response)
    return
  }
  if (pathname === '/api/keys/remove') {
    void answerRemove(request, response)
    return
  }
  response.statusCode = 404
  response.end('not found')
}

async function answerIssue(
  caller: string,
  request: IncomingMessage,
  response: ServerResponse
) {
  let body
  try {
    body = z
      .object({ name: z.string() })
      .parse(JSON.parse(await readBody(request)))
  } catch {
    response.statusCode = 400
    response.end('expected { name }')
    return
  }
  answerJson(response, addDevice(body.name, caller))
}

async function answerRemove(
  request: IncomingMessage,
  response: ServerResponse
) {
  let hashes
  try {
    hashes = z.array(z.string()).parse(JSON.parse(await readBody(request)))
  } catch {
    response.statusCode = 400
    response.end('expected a list of keys')
    return
  }
  removeDevices(hashes)
  answerJson(response, {})
}

export function shareConnections(client: Client, browser: string) {
  const machines = readConnections().flatMap((connection) => {
    const issued = latestIssuedKey(browser, connection.address)
    if (issued === null || issued.expiresAt <= Date.now()) {
      return []
    }
    return [{ addresses: [connection.address], key: issued.key }]
  })
  if (machines.length > 0) {
    client.send({ type: 'machines', machines })
  }
  void issueMissing(client, browser)
}

export function startConnections() {
  void checkConnections()
  setInterval(() => void checkConnections(), CHECK_INTERVAL)
}

async function checkConnections() {
  removeExpiredIssuedKeys()
  for (const connection of readConnections()) {
    const unpaired = readIssuedKeys(connection.address).filter(
      (item) => !isPaired(item.browser)
    )
    if (unpaired.length === 0) {
      continue
    }
    const removed = await requestMachine(
      connection,
      '/api/keys/remove',
      unpaired.map((item) => hash(item.key))
    )
    if (removed !== null) {
      removeIssuedKeys(unpaired.map((item) => item.key))
    }
  }
  for (const client of clients) {
    if (client.device !== null) {
      await issueMissing(client, client.device)
    }
  }
}

async function issueMissing(client: Client, browser: string) {
  for (const connection of readConnections()) {
    const latest = latestIssuedKey(browser, connection.address)
    const marker = `${browser} ${connection.address}`
    if (
      (latest !== null && latest.expiresAt > Date.now() + RENEW_BEFORE) ||
      issuing.has(marker)
    ) {
      continue
    }
    issuing.add(marker)
    try {
      const name = readDevices().find((item) => item.hash === browser)?.name
      const reply = await requestMachine(connection, '/api/keys/issue', {
        name: `${name ?? 'Unnamed'} through ${os.hostname()}`,
      })
      if (reply === null) {
        continue
      }
      const issued = issuedReply.parse(reply)
      saveIssuedKey({
        key: issued.token,
        browser,
        address: connection.address,
        expiresAt: issued.expiresAt,
      })
      client.send({
        type: 'machines',
        machines: [{ addresses: [connection.address], key: issued.token }],
      })
    } finally {
      issuing.delete(marker)
    }
  }
}

async function requestMachine(
  connection: Connection,
  pathname: string,
  body: unknown
): Promise<unknown> {
  try {
    const response = await fetch(`${connection.address}${pathname}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${connection.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })
    if (!response.ok) {
      log.warn(
        `${connection.address} refused ${pathname}: ${await response.text()}`
      )
      return null
    }
    return await response.json()
  } catch (error) {
    log.warn(`could not reach ${connection.address} for ${pathname}:`, error)
    return null
  }
}

async function readBody(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
  }
  return body
}

function answerJson(response: ServerResponse, body: unknown) {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}
