import type { PromptDelivery } from '@offsite/core/config'
import type { PermissionDecision, Prompt } from '@offsite/core/items'
import { NO_PROJECT } from '@offsite/core/projects'
import type { SessionPatch } from '@offsite/core/sessions'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { deleteDraft, getDraftSettings } from '@/features/composer/drafts'
import {
  newThreadSettings,
  providerSettings,
  refreshSettings,
} from './accounts'
import { router } from './router'
import { bumpSession } from './sent-sessions'
import {
  draftKey,
  getState,
  type MachineSession,
  machineOf,
  projectOf,
  type Selection,
  showError,
  update,
} from './store'
import { onGuard, syncUrl, terminalPage, terminalView } from './url'
export function openSession(
  selection: Selection,
  query: string | null = null,
  replace = false
) {
  const machine = machineOf(getState(), selection.machine)
  const previous = getState().selection
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
      selection.sessionId === null
        ? previous?.sessionId === null && previous.machine === selection.machine
          ? getState().settings
          : newThreadSettings(machine)
        : (getDraftSettings(draftKey(selection)) ??
          providerSettings(
            machine,
            getState().sessions.find(
              (item) =>
                item.machine === selection.machine &&
                item.id === selection.sessionId
            )?.provider ?? newThreadSettings(machine).provider
          )),
    context: null,
    replacing: null,
    worktree: null,
    paletteOpen: false,
    unseen: getState().unseen.filter(
      (key) =>
        selection.sessionId === null ||
        key !== machineKey(selection.machine, selection.sessionId)
    ),
  })
  syncUrl(replace)
  refreshSettings(selection.machine)
  if (selection.sessionId !== null && machine.status === 'online') {
    loadSession(
      selection.machine,
      selection.projectId,
      selection.sessionId,
      true,
      query
    )
  }
}

export function loadSession(
  machine: string,
  projectId: string,
  sessionId: string,
  opened: boolean,
  query: string | null
) {
  call(machine, 'sessions.open', { projectId, sessionId, opened, query })
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

export function lastTerminalMachine() {
  const machines = getState().machines
  const last = localStorage.getItem('lastTerminal')
  if (last !== null && machines.some((item) => item.id === last)) {
    return last
  }
  return machines.at(0)?.id ?? null
}

export function startChat(machine: string, projectId: string, replace = false) {
  const project = projectOf(getState(), machine, projectId)
  openSession(
    {
      machine,
      projectId:
        project?.scratch === true
          ? NO_PROJECT
          : (project?.parentId ?? projectId),
      sessionId: null,
    },
    null,
    replace
  )
}

export function lastProject() {
  const state = getState()
  const raw = localStorage.getItem('lastProject')
  const last: { machine: string; projectId: string } | null =
    raw === null ? null : JSON.parse(raw)
  const projectless = state.machines.filter(
    (machine) => machine.system?.scratchAvailable === true
  )
  if (
    last !== null &&
    last.projectId === NO_PROJECT &&
    projectless.some((machine) => machine.id === last.machine)
  ) {
    return last
  }
  const registered =
    last === null
      ? undefined
      : state.projects.find(
          (project) =>
            project.machine === last.machine && project.id === last.projectId
        )
  const project = registered ?? state.projects.find((item) => !item.scratch)
  if (project !== undefined) {
    return { machine: project.machine, projectId: project.id }
  }
  if (projectless.length > 0) {
    return { machine: projectless[0].id, projectId: NO_PROJECT }
  }
  return null
}

export function openTerminalPage(machine: string, view: string) {
  const current = terminalPage()
  if (current === machine && terminalView() === view) {
    return
  }
  void router.navigate({
    to: '/terminal/$machine',
    params: { machine },
    search: { project: view === GLOBAL_TERMINALS ? undefined : view },
    replace: current !== null || onGuard(),
    resetScroll: false,
  })
  closeSession()
}

export async function sendPrompt(
  id: string,
  prompt: Prompt,
  delivery: PromptDelivery,
  selection: Selection | null,
  status: 'active' | 'snoozed' | null
) {
  if (selection === null) {
    throw new Error('no session selected')
  }
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  update({ sentAt: Date.now() })
  const revert = bumpSession(selection, status)
  const name = getState().worktree?.trim()
  try {
    await call(selection.machine, 'sessions.send', {
      id,
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      prompt,
      settings: getState().settings,
      delivery,
      status,
      worktree:
        selection.sessionId !== null || name === undefined
          ? null
          : { name: name === '' ? null : name },
    })
  } catch (error) {
    revert()
    throw error
  } finally {
    update({ worktreeStage: null })
  }
  const replacing = getState().replacing
  if (
    selection.sessionId === null &&
    replacing !== null &&
    replacing.machine === selection.machine &&
    replacing.sessionId !== null
  ) {
    update({ replacing: null })
    await removeSession(
      replacing.machine,
      replacing.sessionId,
      replacing.projectId
    )
  }
}

export function unqueue(id: string) {
  const selection = getState().selection
  if (selection === null) {
    return
  }
  call(selection.machine, 'sessions.unqueue', { id }).catch(showError)
}

export function resend(id: string) {
  const selection = getState().selection
  if (selection === null) {
    return
  }
  call(selection.machine, 'sessions.resend', { id }).catch(showError)
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

export function restartSession(machine: string, sessionId: string) {
  call(machine, 'sessions.restart', { sessionId }).catch(showError)
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

export async function regenerateTitle(session: MachineSession) {
  const key = machineKey(session.machine, session.id)
  update({ generatingTitles: [...getState().generatingTitles, key] })
  try {
    await call(session.machine, 'sessions.generateTitle', {
      id: session.id,
      projectId: session.projectId,
    })
  } catch (error) {
    showError(error)
  } finally {
    update({
      generatingTitles: getState().generatingTitles.filter(
        (item) => item !== key
      ),
    })
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
          (item.status === 'pinned' ||
            item.status === 'active' ||
            item.status === 'snoozed') &&
          !(item.machine === machine && item.id === id) &&
          (scope === null ||
            (item.machine === scope.machine &&
              (item.projectId === scope.projectId ||
                (scope.projectId === NO_PROJECT &&
                  projectOf(getState(), item.machine, item.projectId)
                    ?.scratch === true))))
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .at(0)
    if (latest === undefined) {
      startChat(selection.machine, selection.projectId, true)
    } else {
      openSession(
        {
          machine: latest.machine,
          projectId: latest.projectId,
          sessionId: latest.id,
        },
        null,
        true
      )
    }
  }
  await editSession(machine, id, { status: 'inactive' })
}

export async function removeSession(
  machine: string,
  id: string,
  projectId: string
) {
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
    startChat(machine, selection.projectId, true)
  }
  try {
    await call(machine, 'sessions.remove', { id, projectId })
  } catch (error) {
    showError(error)
  }
}
