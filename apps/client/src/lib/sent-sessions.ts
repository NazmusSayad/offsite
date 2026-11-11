import { getState, type MachineSession, type Selection, update } from './store'

const bumped = new Map<
  string,
  {
    updatedAt: number
    status: MachineSession['status']
    before: { updatedAt: number; status: MachineSession['status'] }
  }
>()

export function bumpSession(
  selection: Selection,
  status: 'active' | 'snoozed' | null
) {
  const key = `${selection.machine}\n${selection.sessionId}`
  const before = getState().sessions.find(
    (item) =>
      item.machine === selection.machine && item.id === selection.sessionId
  )
  if (before === undefined) {
    return () => undefined
  }
  const sent = {
    updatedAt: Date.now(),
    status: sentStatus(before.status, status),
    before: { updatedAt: before.updatedAt, status: before.status },
  }
  bumped.set(key, sent)
  setSession(selection, before.updatedAt, sent)
  return () => {
    if (bumped.get(key) === sent) {
      bumped.delete(key)
      setSession(selection, sent.updatedAt, sent.before)
    }
  }
}

export function withBump(session: MachineSession) {
  const key = `${session.machine}\n${session.id}`
  const sent = bumped.get(key)
  if (sent === undefined) {
    return session
  }
  if (
    session.updatedAt !== sent.before.updatedAt &&
    session.updatedAt !== sent.updatedAt
  ) {
    bumped.delete(key)
    return session
  }
  return { ...session, updatedAt: sent.updatedAt, status: sent.status }
}

function setSession(
  selection: Selection,
  updatedAt: number,
  patch: { updatedAt: number; status: MachineSession['status'] }
) {
  update({
    sessions: getState().sessions.map((item) =>
      item.machine === selection.machine &&
      item.id === selection.sessionId &&
      item.updatedAt === updatedAt
        ? { ...item, updatedAt: patch.updatedAt, status: patch.status }
        : item
    ),
  })
}

function sentStatus(
  current: MachineSession['status'],
  requested: 'active' | 'snoozed' | null
): MachineSession['status'] {
  switch (current) {
    case 'pinned':
      return 'pinned'
    case 'snoozed':
    case 'minimized':
      return requested ?? current
    case 'active':
    case 'inactive':
      return requested ?? 'active'
  }
}
