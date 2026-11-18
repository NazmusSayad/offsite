import type {
  AnswerDraft,
  PermissionDecision,
  PermissionRequest,
} from '@offsite/core/items'
import { call } from '@/api/connection'
import { getState, showError, update } from './store'

export function respond(
  requestId: string,
  decision: PermissionDecision,
  answers: Record<string, string> | null
) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.respond', {
    sessionId: selection.sessionId,
    requestId,
    decision,
    answers,
  }).catch(showError)
}

export function draftAnswers(requestId: string, answers: AnswerDraft) {
  const state = getState()
  const selection = state.selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  update({ requests: withAnswers(state.requests, requestId, answers) })
  call(selection.machine, 'sessions.draftAnswers', {
    sessionId: selection.sessionId,
    requestId,
    answers,
  }).catch(showError)
}

export function stopAutoResolve(requestId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.stopAutoResolve', {
    sessionId: selection.sessionId,
    requestId,
  }).catch(showError)
}

export function withDeadline(
  requests: PermissionRequest[],
  requestId: string,
  at: number | null
) {
  return requests.map((item) => {
    if (item.id !== requestId || item.autoResolve === undefined) {
      return item
    }
    if (at === null) {
      return { ...item, autoResolve: undefined }
    }
    return { ...item, autoResolve: { ...item.autoResolve, at } }
  })
}

export function withAnswers(
  requests: PermissionRequest[],
  requestId: string,
  answers: AnswerDraft
) {
  return requests.map((item) =>
    item.id === requestId && item.kind === 'question'
      ? { ...item, answers }
      : item
  )
}
