import type { PromptDelivery } from '@offsite/core/config'
import type { Prompt, OutboxPrompt } from '@offsite/core/items'
import type { UserItem } from '@/features/transcript/timeline'
import {
  activityOf,
  getState,
  type Machine,
  type MachineSession,
  type MachineOutboxPrompt,
  type Selection,
  setMachine,
  type State,
  update,
} from './store'

const PREFIX = 'outbox:'
const none: OutboxPrompt[] = []

export function receiveOutbox(machine: string, outbox: OutboxPrompt[]) {
  setMachine(machine, { outbox })
  const local = getState().outbox
  const left = local.filter(
    (item) => !outbox.some((saved) => saved.id === item.id)
  )
  if (left.length !== local.length) {
    update({ outbox: left })
  }
}

export function addToOutbox(
  selection: Selection,
  prompt: Prompt,
  delivery: PromptDelivery,
  status: 'active' | 'snoozed' | null
) {
  const state = getState()
  const id = crypto.randomUUID()
  update({
    outbox: [
      ...state.outbox,
      {
        id,
        machine: selection.machine,
        projectId: selection.projectId,
        sessionId: selection.sessionId,
        provider: state.settings.provider,
        prompt,
        status:
          delivery === 'queue' &&
          activityOf(state.machines, selection.machine, selection.sessionId)
            ?.running === true
            ? 'queued'
            : 'sending',
        snoozed: status === 'snoozed',
        createdAt: Date.now(),
      },
    ],
  })
  return id
}

export function takeFromOutbox(id: string) {
  const local = getState().outbox
  update({ outbox: local.filter((item) => item.id !== id) })
  return local.find((item) => item.id === id)
}

export function savedOutbox(state: State) {
  return (
    state.machines.find((machine) => machine.id === state.selection?.machine)
      ?.outbox ?? none
  )
}

export function selectedPrompts(state: State): OutboxPrompt[] {
  const selection = state.selection
  if (selection === null) {
    return []
  }
  return [
    ...(state.loaded ? savedOutbox(state) : []),
    ...state.outbox.filter((item) => item.machine === selection.machine),
  ].filter(
    (item) =>
      item.sessionId === selection.sessionId &&
      (item.sessionId !== null || item.projectId === selection.projectId)
  )
}

export function outboxItems(prompts: OutboxPrompt[]) {
  return prompts
    .filter((item) => item.status !== 'queued')
    .map((item): UserItem => ({
      id: `${PREFIX}${item.id}`,
      parent: null,
      time: null,
      kind: 'user',
      text: item.prompt.text,
      images: item.prompt.images,
      format: 'text',
    }))
}

export function outboxId(item: UserItem) {
  return item.id.startsWith(PREFIX) ? item.id.slice(PREFIX.length) : null
}

export function outboxChats(machines: Machine[], local: MachineOutboxPrompt[]) {
  return [
    ...machines.flatMap((machine) =>
      machine.outbox.map((item) => ({ ...item, machine: machine.id }))
    ),
    ...local,
  ]
    .filter((item) => item.sessionId === null)
    .map((item): MachineSession => ({
      machine: item.machine,
      id: `${PREFIX}${item.id}`,
      provider: item.provider,
      title: item.prompt.text === '' ? 'New thread' : item.prompt.text,
      projectId: item.projectId,
      branch: null,
      updatedAt: item.createdAt,
      status: item.snoozed ? 'snoozed' : 'active',
      claudeWorktree: false,
    }))
}

export function chatSessionId(id: string) {
  return id.startsWith(PREFIX) ? null : id
}

export function notSent(state: State, session: MachineSession) {
  return state.machines.some(
    (machine) =>
      machine.id === session.machine &&
      machine.outbox.some(
        (item) =>
          item.status === 'failed' &&
          (item.sessionId === session.id ||
            `${PREFIX}${item.id}` === session.id)
      )
  )
}
