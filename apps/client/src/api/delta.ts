import { getState, update } from '@/lib/store'

const DELTA_DELAY = 50

let pendingDelta: { machine: string; sessionId: string; text: string } | null =
  null

export function queueDelta(machine: string, sessionId: string, text: string) {
  const selection = getState().selection
  if (selection?.machine !== machine || selection.sessionId !== sessionId) {
    return
  }
  if (
    pendingDelta !== null &&
    (pendingDelta.machine !== machine || pendingDelta.sessionId !== sessionId)
  ) {
    flushDelta()
  }
  if (pendingDelta === null) {
    pendingDelta = { machine, sessionId, text: '' }
    setTimeout(flushDelta, DELTA_DELAY)
  }
  pendingDelta.text += text
}

export function flushDelta() {
  if (pendingDelta === null) {
    return
  }
  const delta = pendingDelta
  pendingDelta = null
  const state = getState()
  if (
    state.selection?.machine === delta.machine &&
    state.selection.sessionId === delta.sessionId
  ) {
    update({ partial: state.partial + delta.text })
  }
}
