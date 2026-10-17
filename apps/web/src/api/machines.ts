import { HOSTED_APP, PROTOCOL, type Project } from '@offsite/core/protocol'
import type { MachineIcon } from '@/components/icons'

export type StoredMachine = {
  id: string
  addresses: string[]
  name: string
  label: string | null
  icon: MachineIcon
  token: string | null
  projects: Project[]
}

const storageKey = 'machines'
const PROBE_TIMEOUT = 5000

export const home = location.origin === HOSTED_APP ? null : location.origin

export function loadMachines(): StoredMachine[] {
  const raw = localStorage.getItem(storageKey)
  return raw === null ? [] : JSON.parse(raw)
}

export function saveMachines(machines: StoredMachine[]) {
  localStorage.setItem(storageKey, JSON.stringify(machines))
}

export async function shareWithWorker(token: string | null) {
  if (!('caches' in window)) return
  const params = new URLSearchParams({
    protocol: String(PROTOCOL),
    ...(token !== null && { token }),
  })
  const cache = await caches.open('offsite-worker')
  await cache.put('/connection', new Response(String(params)))
}

export async function probeMachine(address: string) {
  let response: Response
  try {
    response = await fetch(`${address}/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT),
    })
  } catch {
    throw new Error(`Could not reach ${new URL(address).host}`)
  }
  if (!response.ok)
    throw new Error(`${new URL(address).host} answered ${response.status}`)
  const server: { machineId?: unknown } = await response.json()
  if (typeof server.machineId !== 'string')
    throw new Error(
      `${new URL(address).host} runs a version of offsite that this page cannot talk to`
    )
  return server.machineId
}

export function pairingFromUrl() {
  if (location.pathname !== '/pair') return null
  const params = new URLSearchParams(location.hash.slice(1))
  history.replaceState(null, '', '/')
  const machine = params.get('machine')
  const address = machine === null ? home : readMachineLink(machine).address
  if (address === null) throw new Error('the pairing link has no machine')
  const fallback = params.get('fallback')
  return {
    address,
    fallback: fallback === null ? null : readMachineLink(fallback).address,
    token: params.get('token'),
  }
}

export function readMachineLink(link: string): {
  address: string
  fallback: string | null
  token: string | null
} {
  const trimmed = link.trim()
  const url = new URL(
    /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  )
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Use an http:// or https:// address')
  const params = new URLSearchParams(url.hash.slice(1))
  const machine = params.get('machine')
  const fallback = params.get('fallback')
  return {
    address: machine === null ? url.origin : readMachineLink(machine).address,
    fallback: fallback === null ? null : readMachineLink(fallback).address,
    token: params.get('token'),
  }
}

export function machineKey(machine: string, id: string) {
  return `${machine} ${id}`
}
