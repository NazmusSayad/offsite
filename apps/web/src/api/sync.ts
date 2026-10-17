import {
  PROTOCOL,
  type Project,
  type ServerEvent,
  type Session,
} from '@offsite/core/protocol'
import { getDraftSettings, saveDraftSettings } from '@/features/composer/drafts'
import {
  emptySettings,
  providerSettings,
  refreshAccounts,
  refreshCapabilities,
  setAccounts,
} from '@/lib/accounts'
import { notify, push, refreshPushSubscription } from '@/lib/notifications'
import { loadPrefs } from '@/lib/prefs'
import {
  createAppStore,
  draftKey,
  getState,
  homeMachine,
  machineOf,
  setMachine,
  showError,
  update,
} from '@/lib/store'
import { applyTheme } from '@/lib/theme'
import { selectionFromUrl, syncUrl } from '@/lib/url'
import { call, connectMachine, listen } from './connection'
import { receiveConfig } from './machine-config'
import {
  addMachine,
  home,
  loadMachines,
  machineKey,
  pairingFromUrl,
  persistMachines,
  probeMachine,
  receiveMachines,
  restoreMachine,
  restoreProjects,
  shareToken,
} from './machines'

export function start() {
  const stored = loadMachines()
  const selection = selectionFromUrl(stored.map((machine) => machine.id))
  createAppStore({
    machines: stored.map(restoreMachine),
    home: null,
    sessions: [],
    projects: stored.flatMap(restoreProjects),
    prefs: loadPrefs(),
    paletteOpen: false,
    settingsOpen: false,
    settingsPage: 'General',
    settingsAccount: null,
    settingsEditedMachine: null,
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
    error: null,
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
      if (known !== undefined && known.status !== 'offline')
        setMachine(machine, { status: 'offline', via: null })
    },
    refuse: (machine, reason) => setMachine(machine, { status: reason }),
    event: receive,
  })
  addEventListener('storage', (event) => {
    if (event.key === 'machines') receiveMachines()
  })
  for (const machine of stored)
    connectMachine(machine.id, machine.addresses, machine.token)
  void attach()
}

async function attach() {
  try {
    const pairing = pairingFromUrl()
    if (pairing !== null)
      await addMachine(pairing.address, pairing.fallback, pairing.token)
  } catch (error) {
    showError(error)
  }
  try {
    const server = await probeMachine(home)
    if (!server.serving)
      throw new Error(`${new URL(home).host} does not say it serves this page`)
    update({ home: server.id })
    if (getState().machines.length === 0) await addMachine(home, null, null)
    const machine = homeMachine(getState())
    if (machine === undefined) return
    shareToken(machine.token)
    if (machine.via !== null)
      refreshPushSubscription().catch((error: unknown) =>
        console.error('could not refresh the push subscription', error)
      )
  } catch (error) {
    showError(error)
  }
}

async function resync(machine: string) {
  try {
    const snapshot = await call(machine, 'sync', undefined)
    const known = getState().machines.find((item) => item.id === machine)
    if (known === undefined) return
    if (snapshot.protocol !== PROTOCOL) {
      setMachine(machine, { status: 'outdated' })
      return
    }
    setMachine(machine, {
      status: 'online',
      name: known.label ?? snapshot.hostname,
      hostname: snapshot.hostname,
      system: {
        defaults: snapshot.defaults,
        platform: snapshot.platform,
        version: snapshot.version,
        defaultShell: snapshot.defaultShell,
      },
      activity: snapshot.activity,
      providers: snapshot.providers,
    })
    setProjects(machine, snapshot.projects)
    setSessions(machine, snapshot.sessions)
    receiveConfig(machine, snapshot.config)
    reopenThread(machine)
    void refreshAccounts(machine)
    if (getState().selection?.machine === machine) void refreshCapabilities()
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
  update({
    sessions: [
      ...getState().sessions.filter((item) => item.machine !== machine),
      ...sessions.map((session) => ({ ...session, machine })),
    ],
  })
}

function reopenThread(machine: string) {
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId !== null)
    call(machine, 'sessions.open', {
      projectId: selection.projectId,
      sessionId: selection.sessionId,
    }).catch(showError)
}

function receive(machine: string, event: ServerEvent) {
  const state = getState()
  const known = state.machines.find((item) => item.id === machine)
  if (known === undefined || known.status === 'outdated') return
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
        accounts: known.accounts.map((item) =>
          item.id === event.accountId ? { ...item, limits: event.limits } : item
        ),
      })
      return
    case 'config':
      receiveConfig(machine, event.config)
      return
    case 'projects':
      setProjects(machine, event.projects)
      return
    case 'sessions':
      setSessions(machine, event.sessions)
      return
    case 'accounts':
      setAccounts(machine, event.accounts)
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
      )
        return
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
  }
  if (current === null || event.sessionId !== current) return
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
                machineOf(state, machine).config,
                event.provider
              )),
        context: event.context,
        partial: event.partial,
      })
      if (event.settings !== null)
        saveDraftSettings(machineKey(machine, event.sessionId), event.settings)
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
