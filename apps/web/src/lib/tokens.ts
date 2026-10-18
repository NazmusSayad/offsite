import { createStore, del, get, set } from 'idb-keyval'

const database = createStore('offsite', 'tokens')

export function readToken(machine: string) {
  return get<string>(machine, database)
}

export function saveToken(machine: string, token: string) {
  return set(machine, token, database)
}

export function removeToken(machine: string) {
  return del(machine, database)
}
