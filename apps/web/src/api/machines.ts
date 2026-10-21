import type { Project } from '@offsite/core/projects'
import type { MachineIcon } from '@/components/icons'
import { router } from '@/lib/router'
import {
  getState,
  type Machine,
  type MachineProject,
  machineOf,
  setMachine,
  update,
} from '@/lib/store'
import { removeToken, saveToken } from '@/lib/tokens'
import { syncUrl } from '@/lib/url'
import { connectMachine, disconnectMachine } from './connection'

export type StoredMachine = {
  id: string
  addresses: string[]
  name: string
  label: string | null
  icon: MachineIcon
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
  if (!('caches' in window)) {
    return
  }
  const shared = machines.map((machine) => ({
    id: machine.id,
    addresses: machine.addresses,
  }))
  const cache = await caches.open('offsite-worker')
  await cache.put('/machines', new Response(JSON.stringify(shared)))
}

export function pairingFromUrl() {
  if (location.pathname !== '/pair') {
    return null
  }
  const params = new URLSearchParams(location.hash.slice(1))
  void router.navigate({ to: '/', replace: true })
  const machine = params.get('machine')
  if (machine === null) {
    throw new Error('the pairing link has no machine')
  }
  return {
    address: readMachineLink(machine).address,
    code: params.get('code'),
  }
}

export function readMachineLink(link: string): {
  address: string
  code: string | null
} {
  const trimmed = link.trim()
  const url = new URL(
    /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  )
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Use an http:// or https:// address')
  }
  const params = new URLSearchParams(url.hash.slice(1))
  const machine = params.get('machine')
  return {
    address: machine === null ? url.origin : readMachineLink(machine).address,
    code: params.get('code'),
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
    pairedAt: machine.pairedAt ?? null,
    config: null,
    composer: null,
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
  for (const machine of known) {
    if (!stored.some((item) => item.id === machine.id)) {
      forgetMachine(machine.id)
    }
  }
  for (const machine of stored) {
    const current = known.find((item) => item.id === machine.id)
    if (current === undefined) {
      const state = getState()
      update({
        machines: [...state.machines, restoreMachine(machine)],
        projects: [...state.projects, ...restoreProjects(machine)],
      })
      connectMachine(machine.id, machine.addresses)
      continue
    }
    setMachine(machine.id, {
      label: machine.label,
      icon: machine.icon,
      name: machine.label ?? current.hostname,
    })
    if (
      machine.addresses.join(' ') !== current.addresses.join(' ') ||
      machine.pairedAt !== current.pairedAt
    ) {
      setMachine(machine.id, {
        addresses: machine.addresses,
        pairedAt: machine.pairedAt,
      })
      reconnectMachine(machine.id)
    }
  }
}

export async function addMachine(address: string, code: string | null) {
  const existing = getState().machines.find((item) =>
    item.addresses.includes(address)
  )
  if (existing !== undefined) {
    if (code !== null) {
      await pairMachine(existing.id, code)
    }
    return existing.id
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  if (code !== null) {
    await saveToken(id, await redeemCode([address], code))
  }
  update({
    machines: [
      ...getState().machines,
      restoreMachine({
        id,
        addresses: [address],
        name: new URL(address).hostname,
        label: null,
        icon: 'computer',
        pairedAt: code === null ? null : Date.now(),
        projects: [],
      }),
    ],
  })
  persistMachines()
  connectMachine(id, [address])
  return id
}

export async function pairMachine(id: string, code: string) {
  const known = machineOf(getState(), id)
  await saveToken(id, await redeemCode(known.addresses, code))
  setMachine(id, { pairedAt: Date.now() })
  persistMachines()
  reconnectMachine(id)
}

async function redeemCode(addresses: string[], code: string) {
  let failure: unknown
  for (const address of addresses) {
    const response = await fetch(`${address}/api/pair`, {
      method: 'POST',
      headers: { authorization: `Bearer ${code}` },
    }).catch((error: unknown) => {
      failure ??= error
      return null
    })
    if (response === null) {
      continue
    }
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const body: { token: string } = await response.json()
    return body.token
  }
  throw new Error(`Could not reach the machine to pair: ${String(failure)}`)
}

export function editMachine(
  id: string,
  patch: Partial<Pick<Machine, 'addresses' | 'label' | 'icon'>>
) {
  const known = machineOf(getState(), id)
  const next = { ...known, ...patch }
  setMachine(id, {
    ...patch,
    name: next.label ?? next.hostname,
  })
  persistMachines()
  if (next.addresses.join(' ') !== known.addresses.join(' ')) {
    reconnectMachine(id)
  }
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
  connectMachine(id, machine.addresses)
}

export function removeMachine(id: string) {
  forgetMachine(id)
  persistMachines()
  removeToken(id).catch((error: unknown) =>
    console.error('could not remove the device token', error)
  )
}

function forgetMachine(id: string) {
  disconnectMachine(id)
  const state = getState()
  const machines = state.machines.filter((item) => item.id !== id)
  update({
    machines,
    projects: state.projects.filter((item) => item.machine !== id),
    sessions: state.sessions.filter((item) => item.machine !== id),
    inactive: state.inactive.filter((item) => item.machine !== id),
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
