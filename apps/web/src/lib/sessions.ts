import type { PromptDelivery } from '@offsite/core/config'
import type { PermissionDecision, Prompt } from '@offsite/core/items'
import type { SessionPatch } from '@offsite/core/sessions'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { deleteDraft, getDraftSettings } from '@/features/composer/drafts'
import { providerSettings, refreshCapabilities, setAccounts } from './accounts'
import { router } from './router'
import {
  draftKey,
  getState,
  type MachineSession,
  machineOf,
  type Selection,
  showError,
  update,
} from './store'
import { syncUrl, terminalPage } from './url'
export function openSession(selection: Selection) {
  const machine = machineOf(getState(), selection.machine)
  localStorage.setItem(
    'lastProject',
    JSON.stringify({
      machine: selection.machine,
      projectId: selection.projectId,
    })
  )
  update({
    selection,
    loaded: selection.sessionId === null,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      (selection.sessionId === null
        ? null
        : getDraftSettings(draftKey(selection))) ??
      providerSettings(
        machine.composer,
        getState().sessions.find(
          (item) =>
            item.machine === selection.machine &&
            item.id === selection.sessionId
        )?.provider ??
          machine.composer?.provider ??
          'claude'
      ),
    context: null,
    paletteOpen: false,
    unseen: getState().unseen.filter(
      (key) =>
        selection.sessionId === null ||
        key !== machineKey(selection.machine, selection.sessionId)
    ),
  })
  syncUrl()
  if (
    machine.claudeAccounts.length > 0 ||
    machine.codexAccounts.length > 0 ||
    machine.openCode.available
  ) {
    setAccounts(selection.machine, {
      claudeAccounts: machine.claudeAccounts,
      codexAccounts: machine.codexAccounts,
      openCode: machine.openCode,
    })
  }
  void refreshCapabilities()
  if (selection.sessionId !== null && machine.status === 'online') {
    loadSession(selection.machine, selection.projectId, selection.sessionId)
  }
}

export function loadSession(
  machine: string,
  projectId: string,
  sessionId: string
) {
  call(machine, 'sessions.open', { projectId, sessionId })
    .then((session) => {
      if (
        session === null ||
        getState().sessions.some(
          (item) => item.machine === machine && item.id === session.id
        )
      ) {
        return
      }
      update({ sessions: [...getState().sessions, { ...session, machine }] })
    })
    .catch(showError)
}

export function closeSession() {
  update({
    selection: null,
    loaded: false,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    context: null,
  })
  syncUrl()
}

export function openTerminalPage(machine: string) {
  const current = terminalPage()
  if (current === machine) {
    return
  }
  void router.navigate({
    to: '/terminal/$machine',
    params: { machine },
    search: {},
    replace: current !== null,
    state: { layer: 'chat' },
    resetScroll: false,
  })
  closeSession()
}

export async function sendPrompt(prompt: Prompt, delivery: PromptDelivery) {
  const selection = getState().selection
  if (selection === null) {
    throw new Error('no session selected')
  }
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  update({ sentAt: Date.now() })
  await call(selection.machine, 'sessions.send', {
    sessionId: selection.sessionId,
    projectId: selection.projectId,
    prompt,
    settings: getState().settings,
    delivery,
  })
}

export function unqueue(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.unqueue', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function steer(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.steer', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function interrupt() {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.interrupt', {
    sessionId: selection.sessionId,
  }).catch(showError)
}

export function stopTask(machine: string, sessionId: string, taskId: string) {
  call(machine, 'sessions.stopTask', { sessionId, taskId }).catch(showError)
}

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

export async function forkFrom(messageId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  try {
    const result = await call(selection.machine, 'sessions.fork', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      messageId,
    })
    openSession({ ...selection, sessionId: result.sessionId })
  } catch (error) {
    showError(error)
  }
}

export async function loadEarlier() {
  const selection = getState().selection
  const before = getState().before
  if (selection === null || selection.sessionId === null || before === null) {
    return
  }
  try {
    const result = await call(selection.machine, 'sessions.earlier', {
      sessionId: selection.sessionId,
      before,
    })
    if (getState().selection !== selection || getState().before !== before) {
      return
    }
    update({
      earlier: [...result.items, ...getState().earlier],
      before: result.before,
    })
  } catch (error) {
    showError(error)
  }
}

export async function loadAgent(parent: string, agentId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  try {
    const loaded = await call(selection.machine, 'sessions.agent', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      agentId,
      parent,
    })
    if (getState().selection !== selection) {
      return
    }
    const ids = new Set(loaded.map((item) => item.id))
    const items = getState().items
    update({
      items: [
        ...items.filter((item) => item.parent !== parent),
        ...loaded,
        ...items.filter((item) => item.parent === parent && !ids.has(item.id)),
      ],
    })
  } catch (error) {
    showError(error)
  }
}

export async function editSession(
  machine: string,
  id: string,
  patch: SessionPatch
) {
  const state = getState()
  function same(item: MachineSession) {
    return item.machine === machine && item.id === id
  }
  const session = [...state.sessions, ...state.inactive].find(same)
  if (session !== undefined) {
    const edited = { ...session, ...patch }
    update({
      sessions: state.sessions.some(same)
        ? state.sessions.map((item) => (same(item) ? edited : item))
        : edited.status === 'inactive'
          ? state.sessions
          : [...state.sessions, edited],
      inactive:
        edited.status !== 'inactive'
          ? state.inactive.filter((item) => !same(item))
          : state.inactive.some(same)
            ? state.inactive.map((item) => (same(item) ? edited : item))
            : [edited, ...state.inactive],
    })
  }
  try {
    await call(machine, 'sessions.update', { id, patch })
  } catch (error) {
    showError(error)
  }
}

export async function closingTerminals(machine: string, id: string) {
  const sessions = getState().sessions
  const selection = getState().selection
  const session = sessions.find(
    (item) => item.machine === machine && item.id === id
  )
  if (
    session === undefined ||
    sessions.some(
      (item) =>
        item.machine === machine &&
        item.projectId === session.projectId &&
        item.id !== id &&
        item.status !== 'inactive'
    ) ||
    (getState().loaded &&
      selection?.machine === machine &&
      selection.projectId === session.projectId &&
      selection.sessionId !== null &&
      !sessions.some(
        (item) => item.machine === machine && item.id === selection.sessionId
      ))
  ) {
    return 0
  }
  try {
    return await call(machine, 'terminal.count', {
      projectId: session.projectId,
    })
  } catch (error) {
    showError(error)
    return null
  }
}

export async function deactivateSession(
  machine: string,
  id: string,
  scope: { machine: string; projectId: string } | null
) {
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId === id) {
    const latest = getState()
      .sessions.filter(
        (item) =>
          (item.status === 'pinned' || item.status === 'active') &&
          !(item.machine === machine && item.id === id) &&
          (scope === null ||
            (item.machine === scope.machine &&
              item.projectId === scope.projectId))
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .at(0)
    openSession(
      latest === undefined
        ? { ...selection, sessionId: null }
        : {
            machine: latest.machine,
            projectId: latest.projectId,
            sessionId: latest.id,
          }
    )
  }
  await editSession(machine, id, { status: 'inactive' })
}

export async function removeSession(machine: string, id: string) {
  update({
    sessions: getState().sessions.filter(
      (item) => item.machine !== machine || item.id !== id
    ),
    inactive: getState().inactive.filter(
      (item) => item.machine !== machine || item.id !== id
    ),
  })
  deleteDraft(machineKey(machine, id))
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId === id) {
    openSession({ ...selection, sessionId: null })
  }
  try {
    await call(machine, 'sessions.remove', { id })
  } catch (error) {
    showError(error)
  }
}
