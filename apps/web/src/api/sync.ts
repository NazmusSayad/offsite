import { PROTOCOL, type ServerEvent } from '@offsite/core/protocol'
import { getDraftSettings, saveDraftSettings } from '@/features/composer/drafts'
import { notify, push } from '@/lib/notifications'
import { loadPrefs } from '@/lib/prefs'
import {
  createAppStore,
  draftKey,
  emptySettings,
  getState,
  type Machine,
  type MachineProject,
  type MachineSession,
  machineOf,
  providerSettings,
  refreshAccounts,
  refreshCapabilities,
  setAccounts,
  setMachine,
  showError,
  update,
} from '@/lib/store'
import { applyTheme } from '@/lib/theme'
import { selectionFromUrl, syncUrl } from '@/lib/url'
import { call, connectMachine, disconnectMachine, listen } from './connection'
import { receiveConfig } from './machine-config'
import {
  home,
  loadMachines,
  machineKey,
  saveMachines,
  shareWithWorker,
} from './machines'

export function start() {
  const stored = loadMachines()
  const selection = selectionFromUrl(stored.map((machine) => machine.origin))
  createAppStore({
    machines: stored.map((machine) => ({
      origin: machine.origin,
      url: machine.url,
      fallback: machine.fallback,
      via: null,
      status: 'connecting',
      name: machine.label ?? machine.name,
      hostname: machine.name,
      label: machine.label,
      icon: machine.icon,
      token: machine.token,
      config: null,
      configError: null,
      system: null,
      accounts: [],
      activity: {},
    })),
    sessions: [],
    projects: stored.flatMap((machine) =>
      machine.projects.map((project) => ({
        ...project,
        machine: machine.origin,
      }))
    ),
    prefs: loadPrefs(),
    paletteOpen: false,
    settingsOpen: false,
    settingsPage: 'General',
    settingsMachine: stored.at(0)?.origin ?? null,
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
      (selection === null ? null : getDraftSettings(draftKey(selection))) ??
      emptySettings,
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
      const known = getState().machines.find((item) => item.origin === machine)
      if (known !== undefined && known.status !== 'offline')
        setMachine(machine, { status: 'offline', via: null })
    },
    refuse: (machine, reason) => setMachine(machine, { status: reason }),
    event: receive,
  })
  for (const machine of stored)
    connectMachine(
      machine.origin,
      machineUrls(machine.url, machine.fallback),
      machine.token
    )
}

async function resync(machine: string) {
  try {
    const snapshot = await call(machine, 'sync', undefined)
    const known = getState().machines.find((item) => item.origin === machine)
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
    })
    setProjects(
      machine,
      snapshot.projects.map((project) => ({ ...project, machine }))
    )
    setSessions(
      machine,
      snapshot.sessions.map((session) => ({ ...session, machine }))
    )
    receiveConfig(machine, snapshot.config)
    reopenThread(machine)
    void refreshAccounts(machine)
    if (getState().selection?.machine === machine) void refreshCapabilities()
  } catch (error) {
    showError(error)
  }
}

function setProjects(machine: string, projects: MachineProject[]) {
  update({
    projects: [
      ...getState().projects.filter((item) => item.machine !== machine),
      ...projects,
    ],
  })
  persistMachines()
}

function setSessions(machine: string, sessions: MachineSession[]) {
  update({
    sessions: [
      ...getState().sessions.filter((item) => item.machine !== machine),
      ...sessions,
    ],
  })
}

function reopenThread(machine: string) {
  const selection = getState().selection
  if (
    selection !== null &&
    selection.machine === machine &&
    selection.sessionId !== null
  )
    call(machine, 'sessions.open', {
      cwd: selection.cwd,
      sessionId: selection.sessionId,
    }).catch(showError)
}

function receive(machine: string, event: ServerEvent) {
  const state = getState()
  const known = state.machines.find((item) => item.origin === machine)
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
      setProjects(
        machine,
        event.projects.map((project) => ({ ...project, machine }))
      )
      return
    case 'sessions':
      setSessions(
        machine,
        event.sessions.map((session) => ({ ...session, machine }))
      )
      return
    case 'accounts':
      setAccounts(machine, event.accounts)
      return
    case 'started':
      saveDraftSettings(
        machineKey(machine, event.sessionId),
        getDraftSettings(machineKey(machine, event.cwd))
      )
      saveDraftSettings(machineKey(machine, event.cwd), null)
      if (
        state.selection === null ||
        !selected ||
        state.selection.cwd !== event.cwd ||
        state.selection.sessionId !== null
      )
        return
      update({
        selection: { machine, cwd: event.cwd, sessionId: event.sessionId },
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

export function addMachine(
  origin: string,
  fallback: string | null,
  token: string | null
) {
  const existing = getState().machines.find(
    (item) => item.origin === origin || item.url === origin
  )
  if (existing !== undefined) {
    if (token === null && fallback === null)
      throw new Error(`${origin} is already in the list`)
    editMachine(existing.origin, {
      ...(token !== null && { token }),
      ...(fallback !== null && { fallback }),
    })
    return existing.origin
  }
  update({
    machines: [
      ...getState().machines,
      {
        origin,
        url: origin,
        fallback,
        via: null,
        status: 'connecting',
        name: new URL(origin).hostname,
        hostname: new URL(origin).hostname,
        label: null,
        icon: 'computer',
        token,
        config: null,
        configError: null,
        system: null,
        accounts: [],
        activity: {},
      },
    ],
  })
  persistMachines()
  connectMachine(origin, machineUrls(origin, fallback), token)
  return origin
}

export function editMachine(
  origin: string,
  patch: Partial<Pick<Machine, 'url' | 'fallback' | 'label' | 'icon' | 'token'>>
) {
  const known = machineOf(getState(), origin)
  const next = { ...known, ...patch }
  setMachine(origin, { ...patch, name: next.label ?? next.hostname })
  persistMachines()
  if (
    next.url !== known.url ||
    next.fallback !== known.fallback ||
    next.token !== known.token
  )
    reconnectMachine(origin)
  if (origin === home && next.token !== known.token)
    shareWithWorker(next.token).catch((error: unknown) =>
      console.error('could not share the token with the service worker', error)
    )
}

export function reconnectMachine(origin: string) {
  disconnectMachine(origin)
  setMachine(origin, { status: 'connecting', via: null })
  const machine = machineOf(getState(), origin)
  connectMachine(
    origin,
    machineUrls(machine.url, machine.fallback),
    machine.token
  )
}

function machineUrls(url: string, fallback: string | null) {
  return fallback === null ? [url] : [url, fallback]
}

export function removeMachine(origin: string) {
  if (origin === home) throw new Error('the machine serving this page stays')
  disconnectMachine(origin)
  const state = getState()
  const machines = state.machines.filter((item) => item.origin !== origin)
  update({
    machines,
    projects: state.projects.filter((item) => item.machine !== origin),
    sessions: state.sessions.filter((item) => item.machine !== origin),
    unseen: state.unseen.filter((key) => !key.startsWith(`${origin} `)),
    ...(state.settingsMachine === origin && {
      settingsMachine: machines.at(0)?.origin ?? null,
    }),
    ...(state.selection?.machine === origin && { selection: null }),
  })
  syncUrl()
  persistMachines()
}

function persistMachines() {
  const state = getState()
  saveMachines(
    state.machines.map((machine) => ({
      origin: machine.origin,
      url: machine.url,
      fallback: machine.fallback,
      name: machine.hostname,
      label: machine.label,
      icon: machine.icon,
      token: machine.token,
      projects: state.projects
        .filter((project) => project.machine === machine.origin)
        .map((project) => ({
          path: project.path,
          name: project.name,
          logo: project.logo,
        })),
    }))
  )
}
