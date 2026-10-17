import type { Project } from '@offsite/core/protocol'
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

export function loadMachines(): StoredMachine[] {
  const raw = localStorage.getItem(storageKey)
  return raw === null ? [] : JSON.parse(raw)
}

export function saveMachines(machines: StoredMachine[]) {
  localStorage.setItem(storageKey, JSON.stringify(machines))
}

async function shareWithWorker(machines: StoredMachine[]) {
  if (!('caches' in window)) return
  const shared = machines.map((machine) => ({
    id: machine.id,
    addresses: machine.addresses,
    query: String(
      new URLSearchParams(
        machine.token === null ? {} : { token: machine.token }
      )
    ),
  }))
  const cache = await caches.open('offsite-worker')
  await cache.put('/machines', new Response(JSON.stringify(shared)))
}

export function pairingFromUrl() {
  if (location.pathname !== '/pair') return null
  const params = new URLSearchParams(location.hash.slice(1))
  history.replaceState(null, '', '/')
  const machine = params.get('machine')
  if (machine === null) throw new Error('the pairing link has no machine')
  const fallback = params.get('fallback')
  return {
    address: readMachineLink(machine).address,
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
    claudeAccounts: [],
    codexAccounts: [],
    openCode: { available: false },
    notifier: false,
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

export function addMachine(
  address: string,
  fallback: string | null,
  token: string | null
) {
  const addresses = fallback === null ? [address] : [address, fallback]
  const existing = getState().machines.find((item) =>
    addresses.some((known) => item.addresses.includes(known))
  )
  if (existing !== undefined) {
    if (token !== null) editMachine(existing.id, { token })
    return existing.id
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
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
  return id
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
}

export function shareMachines(machines: StoredMachine[]) {
  shareWithWorker(machines).catch((error: unknown) =>
    console.error('could not share the machines with the service worker', error)
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
  const machines = state.machines.map((machine) => ({
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
  saveMachines(machines)
  shareMachines(machines)
}
