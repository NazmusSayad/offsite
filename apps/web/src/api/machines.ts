import { HOSTED_APP, PROTOCOL, type Project } from '@offsite/core/protocol'
import type { MachineIcon } from '@/components/icons'
import {
  getState,
  type Machine,
  type MachineProject,
  machineOf,
  setMachine,
  update,
} from '@/lib/store'
import { syncUrl } from '@/lib/url'
import { connectMachine, disconnectMachine } from './connection'

export type StoredMachine = {
  id: string
  addresses: string[]
  name: string
  label: string | null
  icon: MachineIcon
  token: string | null
  pairedAt: number | null
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

async function shareWithWorker(token: string | null) {
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
  const server: { machineId?: unknown; serving?: unknown } =
    await response.json()
  if (typeof server.machineId !== 'string')
    throw new Error(
      `${new URL(address).host} runs a version of offsite that this page cannot talk to`
    )
  return { id: server.machineId, serving: server.serving === true }
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

export function restoreMachine(machine: StoredMachine): Machine {
  return {
    id: machine.id,
    addresses: machine.addresses,
    via: null,
    status: 'connecting',
    name: machine.label ?? machine.name,
    hostname: machine.name,
    label: machine.label,
    icon: machine.icon,
    token: machine.token,
    pairedAt: machine.pairedAt ?? null,
    config: null,
    configError: null,
    system: null,
    accounts: [],
    activity: {},
    providers: [],
  }
}

export function restoreProjects(machine: StoredMachine): MachineProject[] {
  return machine.projects.map((project) => ({
    ...project,
    machine: machine.id,
  }))
}

export function receiveMachines() {
  const stored = loadMachines()
  const known = getState().machines
  for (const machine of known)
    if (!stored.some((item) => item.id === machine.id))
      forgetMachine(machine.id)
  for (const machine of stored) {
    const current = known.find((item) => item.id === machine.id)
    if (current === undefined) {
      const state = getState()
      update({
        machines: [...state.machines, restoreMachine(machine)],
        projects: [...state.projects, ...restoreProjects(machine)],
      })
      connectMachine(machine.id, machine.addresses, machine.token)
      continue
    }
    setMachine(machine.id, {
      label: machine.label,
      icon: machine.icon,
      name: machine.label ?? current.hostname,
    })
    if (
      machine.addresses.join(' ') !== current.addresses.join(' ') ||
      machine.token !== current.token
    ) {
      setMachine(machine.id, {
        addresses: machine.addresses,
        token: machine.token,
        pairedAt: machine.pairedAt,
      })
      reconnectMachine(machine.id)
    }
  }
}

export async function addMachine(
  address: string,
  fallback: string | null,
  token: string | null
) {
  const addresses = fallback === null ? [address] : [address, fallback]
  const id = await identify(addresses)
  const existing = getState().machines.find(
    (item) => item.addresses.includes(address) || item.id === id
  )
  if (existing !== undefined) {
    const added = addresses.filter((item) => !existing.addresses.includes(item))
    editMachine(existing.id, {
      addresses: [...existing.addresses, ...added],
      ...(token !== null && { token }),
    })
    return existing.id
  }
  update({
    machines: [
      ...getState().machines,
      restoreMachine({
        id,
        addresses,
        name: new URL(address).hostname,
        label: null,
        icon: 'computer',
        token,
        pairedAt: token === null ? null : Date.now(),
        projects: [],
      }),
    ],
  })
  persistMachines()
  connectMachine(id, addresses, token)
  if (id === getState().home) shareToken(token)
  return id
}

async function identify(addresses: string[]) {
  let failure: unknown
  for (const address of addresses) {
    try {
      return (await probeMachine(address)).id
    } catch (error) {
      failure ??= error
    }
  }
  throw failure
}

export function editMachine(
  id: string,
  patch: Partial<Pick<Machine, 'addresses' | 'label' | 'icon' | 'token'>>
) {
  const known = machineOf(getState(), id)
  const next = { ...known, ...patch }
  setMachine(id, {
    ...patch,
    name: next.label ?? next.hostname,
    ...(next.token !== known.token && {
      pairedAt: next.token === null ? null : Date.now(),
    }),
  })
  persistMachines()
  if (
    next.addresses.join(' ') !== known.addresses.join(' ') ||
    next.token !== known.token
  )
    reconnectMachine(id)
  if (id === getState().home && next.token !== known.token)
    shareToken(next.token)
}

export function shareToken(token: string | null) {
  shareWithWorker(token).catch((error: unknown) =>
    console.error('could not share the token with the service worker', error)
  )
}

export function reconnectMachine(id: string) {
  disconnectMachine(id)
  setMachine(id, { status: 'connecting', via: null })
  const machine = machineOf(getState(), id)
  connectMachine(id, machine.addresses, machine.token)
}

export function removeMachine(id: string) {
  forgetMachine(id)
  persistMachines()
}

function forgetMachine(id: string) {
  disconnectMachine(id)
  const state = getState()
  const machines = state.machines.filter((item) => item.id !== id)
  update({
    machines,
    projects: state.projects.filter((item) => item.machine !== id),
    sessions: state.sessions.filter((item) => item.machine !== id),
    unseen: state.unseen.filter((key) => !key.startsWith(`${id} `)),
    ...(state.settingsMachine === id && {
      settingsMachine: machines.at(0)?.id ?? null,
    }),
    ...(state.selection?.machine === id && { selection: null }),
  })
  syncUrl()
}

export function persistMachines() {
  const state = getState()
  saveMachines(
    state.machines.map((machine) => ({
      id: machine.id,
      addresses: machine.addresses,
      name: machine.hostname,
      label: machine.label,
      icon: machine.icon,
      token: machine.token,
      pairedAt: machine.pairedAt,
      projects: state.projects
        .filter((project) => project.machine === machine.id)
        .map((project) => ({
          id: project.id,
          path: project.path,
          name: project.name,
          logo: project.logo,
        })),
    }))
  )
}
