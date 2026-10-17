import { HOSTED_APP, PROTOCOL, type Project } from '@offsite/core/protocol'

type StoredMachine = {
  origin: string
  name: string
  token: string | null
  projects: Project[]
}

const storageKey = 'machines'

export const home = location.origin === HOSTED_APP ? null : location.origin

export function loadMachines(): StoredMachine[] {
  const raw = localStorage.getItem(storageKey)
  const stored: StoredMachine[] =
    raw === null
      ? []
      : JSON.parse(raw).map((machine: StoredMachine) => ({
          ...machine,
          token: machine.token ?? null,
        }))
  if (home === null) return stored
  return [
    stored.find((machine) => machine.origin === home) ?? {
      origin: home,
      name: location.hostname,
      token: null,
      projects: [],
    },
    ...stored.filter((machine) => machine.origin !== home),
  ]
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

export function pairFromUrl() {
  if (location.pathname !== '/pair') return
  const params = new URLSearchParams(location.hash.slice(1))
  const address = params.get('machine')
  const origin = address === null ? home : readMachineLink(address).origin
  if (origin === null) throw new Error('the pairing link has no machine')
  const token = params.get('token')
  const machines = loadMachines()
  saveMachines(
    machines.some((machine) => machine.origin === origin)
      ? machines.map((machine) =>
          machine.origin === origin ? { ...machine, token } : machine
        )
      : [
          ...machines,
          { origin, name: new URL(origin).hostname, token, projects: [] },
        ]
  )
  history.replaceState(null, '', '/')
}

export function readMachineLink(link: string): {
  origin: string
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
  return {
    origin: machine === null ? url.origin : readMachineLink(machine).origin,
    token: params.get('token'),
  }
}

export function machineKey(machine: string, id: string) {
  return `${machine} ${id}`
}
