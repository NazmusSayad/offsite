import type { ListedMachine } from '@offsite/core/protocol'
import { consola } from 'consola'
import { z } from 'zod'
import { args } from '../args.ts'
import { findDevice } from '../storage/auth.ts'
import {
  readConnections,
  removeConnection,
  saveConnection,
} from '../storage/connections.ts'

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
  const reply = z.object({ token: z.string() }).parse(await response.json())
  saveConnection(connection.address, reply.token)
  console.log(
    `Connected to ${connection.address}; browsers get it the next time they open this machine's web app`
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
  for (const address of picked) {
    removeConnection(address)
    console.log(`Removed ${address}`)
  }
}

export function listMachines(given: string | null): ListedMachine[] | null {
  if (args.auth && (given === null || findDevice(given) === null)) {
    return null
  }
  return [
    ...(args.connect === null
      ? []
      : [{ id: 'host', addresses: args.connect, key: null }]),
    ...readConnections().map((connection) => ({
      id: connection.address,
      addresses: [connection.address],
      key: connection.key,
    })),
  ]
}
