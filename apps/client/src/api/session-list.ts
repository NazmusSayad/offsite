import type { Session } from '@offsite/core/sessions'
import { isEqual } from 'es-toolkit'
import { withBump } from '@/lib/sent-sessions'
import { getState, update } from '@/lib/store'
import { syncUrl } from '@/lib/url'

export function setSessions(machine: string, sessions: Session[]) {
  const state = getState()
  const selection = state.selection
  const listed = state.sessions
    .filter((item) => item.machine === machine && item.status !== 'inactive')
    .map((item) => item.id)
    .sort()
    .join(' ')
  const opened = state.sessions.find(
    (item) =>
      item.machine === machine &&
      item.id === selection?.sessionId &&
      !sessions.some((session) => session.id === item.id)
  )
  const next = [
    ...state.sessions.filter((item) => item.machine !== machine),
    ...sessions.map((session) => withBump({ ...session, machine })),
    ...(opened === undefined
      ? []
      : [withBump({ ...opened, status: 'inactive' as const })]),
  ]
  const inactiveVersion =
    sessions
      .map((session) => session.id)
      .sort()
      .join(' ') === listed
      ? state.inactiveVersion
      : state.inactiveVersion + 1
  if (
    inactiveVersion === state.inactiveVersion &&
    isEqual(next, state.sessions)
  ) {
    return
  }
  update({ sessions: next, inactiveVersion })
  followMovedSession(machine, sessions)
}

function followMovedSession(machine: string, sessions: Session[]) {
  const selection = getState().selection
  const moved = sessions.find(
    (session) =>
      selection?.machine === machine &&
      session.id === selection.sessionId &&
      session.projectId !== selection.projectId
  )
  if (moved !== undefined && selection !== null) {
    update({ selection: { ...selection, projectId: moved.projectId } })
    syncUrl(true)
  }
}
