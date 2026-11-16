import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { watching } from './notifications'
import { getState, type MachineSession, showError, update } from './store'

const reading = new Set<string>()

export function startReads() {
  window.addEventListener('focus', readWatched)
  document.addEventListener('visibilitychange', readWatched)
}

export function withRead(session: MachineSession) {
  return reading.has(machineKey(session.machine, session.id))
    ? { ...session, unread: false }
    : session
}

export function readWatched() {
  const selection = getState().selection
  if (
    selection !== null &&
    selection.sessionId !== null &&
    watching(selection.machine, selection.sessionId)
  ) {
    void readSession(selection.machine, selection.sessionId)
  }
}

export async function readSession(machine: string, id: string) {
  const key = machineKey(machine, id)
  const session = [...getState().sessions, ...getState().inactive].find(
    (item) => item.machine === machine && item.id === id
  )
  if (session === undefined || !session.unread || reading.has(key)) {
    return
  }
  reading.add(key)
  setUnread(machine, id, false)
  try {
    await call(machine, 'sessions.update', { id, patch: { unread: false } })
  } catch (error) {
    setUnread(machine, id, true)
    showError(error)
  } finally {
    reading.delete(key)
  }
}

function setUnread(machine: string, id: string, unread: boolean) {
  function edit(item: MachineSession) {
    return item.machine === machine && item.id === id
      ? { ...item, unread }
      : item
  }
  const state = getState()
  update({
    sessions: state.sessions.map(edit),
    inactive: state.inactive.map(edit),
  })
}
