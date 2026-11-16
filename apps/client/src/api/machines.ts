import type { Project } from '@offsite/core/projects'
import type { ListedMachine } from '@offsite/core/protocol'
import { logger } from '@/lib/log'
import { router } from '@/lib/router'
import {
  getState,
  type Machine,
  type MachineProject,
  machineOf,
  setMachine,
  update,
} from '@/lib/store'
import { readToken, removeToken, saveToken } from '@/lib/tokens'
import { syncUrl } from '@/lib/url'
import { connectMachine, disconnectMachine } from './connection'

const log = logger.withTag('machines')

export type StoredMachine = {
  id: string
  addresses: string[]
  name: string
  icon: string | null
  label: string | null
  pairedAt: number | null
  listId: string | null
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
    listId: machine.listId ?? null,
    config: null,
    lastPickedModelByProvider: null,
    lastMessageAtByAccount: [],
    lastPickedEffortByModel: [],
    appIcon: null,
    service: null,
    configError: null,
    system: null,
    claudeAccounts: [],
    codexAccounts: [],
    openCode: { available: false },
    activity: {},
    providers: [],
    terminals: [],
    bookmarks: [],
    bookmarkList: null,
    outbox: [],
  }
}

export function restoreProjects(machine: StoredMachine): MachineProject[] {
  return machine.projects
    .filter((project) => !('parentId' in project) || project.parentId === null)
    .map((project) => ({
      ...project,
      pinned: project.pinned ?? false,
      hidden: project.hidden ?? false,
      score: project.score ?? 0,
      worktreeSetup: project.worktreeSetup ?? null,
      startInWorktree: project.startInWorktree ?? false,
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
      listId: machine.listId ?? null,
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
  const ids = stored.map((item) => item.id)
  update({
    machines: [...getState().machines].sort(
      (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
    ),
  })
}

export async function addMachine(addresses: string[], code: string | null) {
  const existing = findMachine(addresses)
  if (existing !== undefined) {
    if (code !== null) {
      await pairMachine(existing.id, code)
    }
    return existing.id
  }
  const id = newMachineId()
  if (code !== null) {
    await saveToken(id, await redeemCode(addresses, code))
  }
  createMachine(
    id,
    addresses,
    new URL(addresses[0]).hostname,
    code === null ? null : Date.now(),
    null
  )
  return id
}

export async function syncListedMachines() {
  const host = findMachine([location.origin])
  const token = host === undefined ? undefined : await readToken(host.id)
  const response = await fetch('/api/machines', {
    method: 'POST',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  }).catch((error: unknown) => {
    log.warn('could not get the list of machines:', error)
    return null
  })
  if (response === null) {
    return
  }
  if (!response.ok) {
    log.warn(`could not get the list of machines: ${await response.text()}`)
    return
  }
  const listed: ListedMachine[] = await response.json()
  for (const item of listed) {
    const existing =
      getState().machines.find((machine) => machine.listId === item.id) ??
      findMachine(item.addresses)
    if (existing === undefined) {
      const id = newMachineId()
      if (item.key !== null) {
        await saveToken(id, item.key)
      }
      createMachine(
        id,
        item.addresses,
        new URL(item.addresses[0]).hostname,
        item.key === null ? null : Date.now(),
        item.id
      )
      continue
    }
    if (item.key !== null) {
      await saveToken(existing.id, item.key)
    }
    setMachine(existing.id, { listId: item.id, addresses: item.addresses })
    if (
      item.addresses.join(' ') !== existing.addresses.join(' ') ||
      (item.key !== null && existing.status === 'unpaired')
    ) {
      reconnectMachine(existing.id)
    }
  }
  for (const machine of getState().machines) {
    if (
      machine.listId !== null &&
      !listed.some((item) => item.id === machine.listId)
    ) {
      removeMachine(machine.id)
    }
  }
  persistMachines()
}

function findMachine(addresses: string[]) {
  return getState().machines.find((item) =>
    item.addresses.some((address) => addresses.includes(address))
  )
}

function newMachineId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

function createMachine(
  id: string,
  addresses: string[],
  name: string,
  pairedAt: number | null,
  listId: string | null
) {
  update({
    machines: [
      ...getState().machines,
      restoreMachine({
        id,
        addresses,
        name,
        label: null,
        icon: 'computer',
        pairedAt,
        listId,
        projects: [],
      }),
    ],
  })
  persistMachines()
  connectMachine(id, addresses)
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

export function reorderMachines(ids: string[]) {
  update({
    machines: [...getState().machines].sort(
      (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)
    ),
  })
  persistMachines()
}

export function shareMachines(machines: StoredMachine[]) {
  shareWithWorker(machines).catch((error: unknown) =>
    log.error('could not share the machines with the service worker', error)
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
    log.error('could not remove the device token', error)
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
    listId: machine.listId,
    projects: state.projects
      .filter((project) => project.machine === machine.id)
      .map((project) => ({
        id: project.id,
        path: project.path,
        name: project.name,
        logo: project.logo,
        pinned: project.pinned,
        hidden: project.hidden,
        score: project.score,
        scratch: project.scratch,
        worktreeSetup: project.worktreeSetup,
        startInWorktree: project.startInWorktree,
      })),
  }))
  saveMachines(machines)
  shareMachines(machines)
}
