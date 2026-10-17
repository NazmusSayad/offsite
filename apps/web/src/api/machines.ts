import type { Project } from '@offsite/core/protocol'

type StoredMachine = {
  origin: string
  name: string
  projects: Project[]
}

const storageKey = 'machines'

export const home = location.origin

export function loadMachines(): StoredMachine[] {
  const raw = localStorage.getItem(storageKey)
  const stored: StoredMachine[] = raw === null ? [] : JSON.parse(raw)
  return [
    stored.find((machine) => machine.origin === home) ?? {
      origin: home,
      name: location.hostname,
      projects: [],
    },
    ...stored.filter((machine) => machine.origin !== home),
  ]
}

export function saveMachines(machines: StoredMachine[]) {
  localStorage.setItem(storageKey, JSON.stringify(machines))
}

export function machineOrigin(address: string) {
  const trimmed = address.trim()
  const url = new URL(
    /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  )
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Use an http:// or https:// address')
  return url.origin
}

export function machineKey(machine: string, id: string) {
  return `${machine} ${id}`
}
