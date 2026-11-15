import type { OutboxPrompt } from '@offsite/core/items'
import { findInOutbox, setPendingStatus } from './outbox.ts'
import { publishSessions, updateSession } from './sessions.ts'

export async function updatePending(
  id: string,
  status: OutboxPrompt['sessionStatus']
) {
  const row = findInOutbox(id)
  if (row === undefined) {
    throw new Error('This thread has already started, try again')
  }
  if (row.sessionId === null) {
    setPendingStatus(id, status)
    return
  }
  try {
    await updateSession(row.sessionId, { status })
  } finally {
    publishSessions()
  }
}
