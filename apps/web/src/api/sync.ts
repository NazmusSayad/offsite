import type { Project } from '@offsite/core/projects'
import type { ServerEvent } from '@offsite/core/protocol'
import type { Session } from '@offsite/core/sessions'
import { showToast } from '@/components/toast'
import { getDraftSettings, saveDraftSettings } from '@/features/composer/drafts'
import {
  emptySettings,
  providerSettings,
  refreshAccounts,
  refreshCapabilities,
  setAccounts,
} from '@/lib/accounts'
import { claimNotifications, notify, push } from '@/lib/notifications'
import { loadPrefs } from '@/lib/prefs'
import { router } from '@/lib/router'
import { closeSession, loadSession, openSession } from '@/lib/sessions'
import {
  createAppStore,
  draftKey,
  getState,
  machineOf,
  setMachine,
  showError,
  update,
} from '@/lib/store'
import { applyTheme } from '@/lib/theme'
import { openBrowser, selectionFromUrl, syncUrl } from '@/lib/url'
import { call, connectMachine, listen } from './connection'
import { receiveComposer, receiveConfig } from './machine-config'
import {
  addMachine,
  connectAddresses,
  loadMachines,
  machineKey,
  pairingFromUrl,
  persistMachines,
  receiveMachines,
  restoreMachine,
  restoreProjects,
  shareMachines,
} from './machines'

export function start() {
  const stored = loadMachines()
  const selection = selectionFromUrl(stored.map((machine) => machine.id))
  createAppStore({
    machines: stored.map(restoreMachine),
    sessions: [],
    inactive: [],
    inactiveVersion: 0,
    projects: stored.flatMap(restoreProjects),
    prefs: loadPrefs(),
    paletteOpen: false,
    settingsOpen: false,
    settingsPage: 'General',
    settingsAccount: null,
    settingsEditedMachine: null,
    settingsListing: true,
    settingsMachine: stored.at(0)?.id ?? null,
    unseen: [],
    selection,
    loaded: selection?.sessionId === null,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      (selection === null || selection.sessionId === null
        ? null
        : getDraftSettings(draftKey(selection))) ?? emptySettings,
    draft: null,
    context: null,
    capabilities: null,
    errors: [],
    sentAt: 0,
  })
  applyTheme()
  listen({
    open: (machine, url) => {
      setMachine(machine, { via: url })
      void resync(machine)
    },
    close: (machine) => {
      const known = getState().machines.find((item) => item.id === machine)
      if (known !== undefined && known.status !== 'offline') {
        setMachine(machine, { status: 'offline', via: null, notifier: false })
      }
    },
    unpaired: (machine) =>
      setMachine(machine, { status: 'unpaired', via: null, notifier: false }),
    event: receive,
  })
  addEventListener('keydown', claimNotifications, { capture: true })
  addEventListener('pointerdown', claimNotifications, { capture: true })
  addEventListener('storage', (event) => {
    if (event.key === 'machines') {
      receiveMachines()
    }
  })
  router.history.subscribe((event) => {
    if (event.action.type === 'PUSH' || event.action.type === 'REPLACE') {
      return
    }
    const next = selectionFromUrl(getState().machines.map((item) => item.id))
    if (next === null) {
      closeSession()
      return
    }
    if (getState().selection === null) {
      openSession(next)
      return
    }
    syncUrl()
  })
  for (const machine of stored) {
    connectMachine(machine.id, machine.addresses)
  }
  shareMachines(stored)
  void attach()
}

async function attach() {
  try {
    if (connectAddresses !== null) {
      await addMachine(connectAddresses, null)
    }
    const pairing = pairingFromUrl()
    if (pairing !== null) {
      await addMachine([pairing.address], pairing.code)
    }
  } catch (error) {
    showError(error)
  }
}

async function resync(machine: string) {
  try {
    const snapshot = await call(machine, 'sync', undefined)
    const known = getState().machines.find((item) => item.id === machine)
    if (known === undefined) {
      return
    }
    setMachine(machine, {
      status: 'online',
      name: known.label ?? snapshot.hostname,
      hostname: snapshot.hostname,
      system: {
        defaults: snapshot.defaults,
        platform: snapshot.platform,
        defaultShell: snapshot.defaultShell,
        defaultClaudeBaseDir: snapshot.defaultClaudeBaseDir,
      },
      activity: snapshot.activity,
      providers: snapshot.providers,
    })
    setProjects(machine, snapshot.projects)
    setSessions(machine, snapshot.sessions)
    receiveConfig(machine, snapshot.config)
    receiveComposer(machine, snapshot.composer)
    reopenThread(machine)
    void refreshAccounts(machine)
    if (getState().selection?.machine === machine) {
      void refreshCapabilities()
    }
  } catch (error) {
    showError(error)
  }
}

function setProjects(machine: string, projects: Project[]) {
  update({
    projects: [
      ...getState().projects.filter((item) => item.machine !== machine),
      ...projects.map((project) => ({ ...project, machine })),
    ],
  })
  persistMachines()
}

function setSessions(machine: string, sessions: Session[]) {
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
  update({
    sessions: [
      ...state.sessions.filter((item) => item.machine !== machine),
      ...sessions.map((session) => ({ ...session, machine })),
      ...(opened === undefined
        ? []
        : [{ ...opened, status: 'inactive' as const }]),
    ],
    inactiveVersion:
      sessions
        .map((session) => session.id)
        .sort()
        .join(' ') === listed
        ? state.inactiveVersion
        : state.inactiveVersion + 1,
  })
}

function reopenThread(machine: string) {
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId !== null) {
    loadSession(machine, selection.projectId, selection.sessionId)
  }
}

function receive(machine: string, event: ServerEvent) {
  const state = getState()
  const known = state.machines.find((item) => item.id === machine)
  if (known === undefined) {
    return
  }
  const selected = state.selection?.machine === machine
  const current = selected ? (state.selection?.sessionId ?? null) : null
  switch (event.type) {
    case 'activity': {
      const previous = known.activity
      const running =
        current !== null && event.activity[current]?.running === true
      const finished = Object.keys(previous).filter(
        (id) => previous[id].running && event.activity[id]?.running !== true
      )
      const waiting = Object.keys(event.activity).filter(
        (id) => event.activity[id].waiting && previous[id]?.waiting !== true
      )
      notify(
        machine,
        finished.filter((id) => previous[id].prompted),
        'finished'
      )
      notify(machine, waiting, 'needs your input')
      setMachine(machine, { activity: event.activity })
      update({
        partial: running || !selected ? state.partial : '',
        unseen: [
          ...state.unseen,
          ...finished
            .filter((id) => id !== current)
            .map((id) => machineKey(machine, id))
            .filter((key) => !state.unseen.includes(key)),
        ],
      })
      return
    }
    case 'limits':
      setMachine(machine, {
        claudeAccounts: known.claudeAccounts.map((item) =>
          item.id === event.accountId ? { ...item, limits: event.limits } : item
        ),
        codexAccounts: known.codexAccounts.map((item) =>
          item.id === event.accountId ? { ...item, limits: event.limits } : item
        ),
      })
      return
    case 'config':
      receiveConfig(machine, event.config)
      return
    case 'composer':
      receiveComposer(machine, event.composer)
      return
    case 'projects':
      setProjects(machine, event.projects)
      return
    case 'sessions':
      setSessions(machine, event.sessions)
      return
    case 'accounts':
      setAccounts(machine, event)
      return
    case 'providers':
      setMachine(machine, { providers: event.providers })
      return
    case 'started':
      if (
        state.selection === null ||
        !selected ||
        state.selection.projectId !== event.projectId ||
        state.selection.sessionId !== null
      ) {
        return
      }
      update({
        selection: {
          machine,
          projectId: event.projectId,
          sessionId: event.sessionId,
        },
        loaded: true,
        items: [],
        earlier: [],
        before: null,
        partial: '',
        requests: [],
        queue: [],
      })
      syncUrl()
      return
    case 'notification':
      push(machine, event.sessionId, event.message)
      return
    case 'notifier':
      setMachine(machine, { notifier: event.active })
      return
    case 'open':
      if (selected) {
        openBrowser(event.path)
        return
      }
      showToast(`${known.name} opened ${event.path}`)
      return
  }
  if (current === null || event.sessionId !== current) {
    return
  }
  switch (event.type) {
    case 'history':
      update({
        loaded: true,
        items: event.items,
        earlier: [],
        before: event.before,
        requests: event.requests,
        queue: event.queue,
        settings:
          event.settings ??
          (state.settings.provider === event.provider
            ? state.settings
            : providerSettings(
                machineOf(state, machine).composer,
                event.provider
              )),
        context: event.context,
        partial: event.partial,
      })
      if (event.settings !== null) {
        saveDraftSettings(machineKey(machine, event.sessionId), event.settings)
      }
      return
    case 'context':
      update({ context: event.context })
      return
    case 'items': {
      const updates = new Map(event.items.map((item) => [item.id, item]))
      update({
        items: [
          ...state.items.map((item) => updates.get(item.id) ?? item),
          ...event.items.filter(
            (item) => !state.items.some((existing) => existing.id === item.id)
          ),
        ],
        partial: event.items.some(
          (item) => item.kind === 'assistant' && item.parent === null
        )
          ? ''
          : state.partial,
      })
      return
    }
    case 'delta':
      update({ partial: state.partial + event.text })
      return
    case 'request':
      update({ requests: [...state.requests, event.request] })
      return
    case 'requestDone':
      update({
        requests: state.requests.filter((item) => item.id !== event.requestId),
      })
      return
    case 'queue':
      update({ queue: event.queue })
      return
    case 'settings': {
      const settings = {
        ...event.settings,
        accountId: state.settings.accountId,
      }
      update({ settings })
      saveDraftSettings(machineKey(machine, event.sessionId), settings)
    }
  }
}
