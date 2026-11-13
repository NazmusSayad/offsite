import {
  DEFAULT_CLAUDE_PERMISSION_MODE,
  DEFAULT_PROVIDER,
} from '@offsite/core/config'
import type { Project } from '@offsite/core/projects'
import type { ServerEvent } from '@offsite/core/protocol'
import { isEqual } from 'es-toolkit'
import { toast } from 'sonner'
import {
  getDraft,
  getDraftSettings,
  hasPrompt,
  moveDraft,
  saveDraftSettings,
} from '@/features/composer/drafts'
import { settleDisconnected } from '@/features/composer/send'
import { setOpen as setTerminalOpen } from '@/features/terminal/session'
import {
  providerSettings,
  refreshAccounts,
  refreshCapabilities,
  setAccounts,
} from '@/lib/accounts'
import { receiveBookmarks } from '@/lib/bookmarks'
import { logger } from '@/lib/log'
import { claimNotifications, notify, push } from '@/lib/notifications'
import { moveStartedPrompt, receiveOutbox } from '@/lib/outbox'
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
import {
  leftGuard,
  rememberTerminal,
  selectionFromUrl,
  startGuard,
  syncUrl,
} from '@/lib/url'
import { receiveLimits, receiveUsage } from '@/lib/usage'
import { call, connectMachine, listen } from './connection'
import { flushDelta, queueDelta } from './delta'
import { receiveConfig, receiveLastPickedModels } from './machine-config'
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
import { setSessions } from './session-list'

const log = logger.withTag('sync')

export function start() {
  const stored = loadMachines()
  const selection = selectionFromUrl(stored.map((machine) => machine.id))
  createAppStore({
    machines: stored.map(restoreMachine),
    sessions: [],
    inactive: [],
    inactiveTotal: 0,
    inactiveVersion: 0,
    projects: stored.flatMap(restoreProjects),
    prefs: loadPrefs(),
    paletteOpen: false,
    hotkeyHints: false,
    settingsOpen: false,
    settingsPage: 'General',
    editor: null,
    exporting: null,
    removingWorktree: null,
    settingsAccount: null,
    settingsEditedMachine: null,
    settingsListing: true,
    settingsMachine: stored.at(0)?.id ?? null,
    usageOpen: false,
    bookmarksOpen: false,
    focus: null,
    usage: {},
    unseen: [],
    generatingTitles: [],
    selection,
    view: 0,
    loaded: selection?.sessionId === null,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    outbox: [],
    settings: (selection === null || selection.sessionId === null
      ? null
      : getDraftSettings(draftKey(selection))) ?? {
      provider: DEFAULT_PROVIDER,
      accountId: null,
      model: null,
      effort: null,
      mode: DEFAULT_CLAUDE_PERMISSION_MODE,
      plan: false,
    },
    draft: null,
    replacing: null,
    rewinding: null,
    worktree: null,
    worktreeStage: null,
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
  startGuard()
  router.history.subscribe((event) => {
    if (event.action.type === 'PUSH' || event.action.type === 'REPLACE') {
      return
    }
    if (leftGuard()) {
      syncUrl(true)
      return
    }
    const next = selectionFromUrl(getState().machines.map((item) => item.id))
    if (next === null) {
      closeSession()
      return
    }
    const current = getState().selection
    if (
      current === null ||
      current.machine !== next.machine ||
      current.projectId !== next.projectId ||
      current.sessionId !== next.sessionId
    ) {
      openSession(next)
      return
    }
    rememberTerminal()
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
        homeDir: snapshot.homeDir,
        scratchAvailable: snapshot.scratchAvailable,
        version: snapshot.version,
      },
      activity: snapshot.activity,
      providers: snapshot.providers,
      terminals: snapshot.terminals,
      appIcon: snapshot.appIcon,
      service: snapshot.service,
      lastMessageAtByAccount: snapshot.lastSent,
      lastPickedEffortByModel: snapshot.lastEfforts,
    })
    receiveBookmarks(machine, snapshot.bookmarks)
    receiveOutbox(machine, snapshot.outbox)
    settleDisconnected(machine)
    setProjects(machine, snapshot.projects)
    setSessions(machine, snapshot.sessions)
    receiveConfig(machine, snapshot.config)
    receiveLastPickedModels(machine, snapshot.lastUsed)
    reopenThread(machine)
    void refreshAccounts(machine)
    if (getState().selection?.machine === machine) {
      void refreshCapabilities()
    }
  } catch (error) {
    log.error(`could not sync ${machine}`, error)
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

function reopenThread(machine: string) {
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId !== null) {
    loadSession(machine, selection.projectId, selection.sessionId, false, null)
  }
}

function receive(machine: string, event: ServerEvent) {
  if (event.type === 'delta') {
    queueDelta(machine, event.sessionId, event.text)
    return
  }
  flushDelta()
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
      setMachine(machine, {
        activity: Object.fromEntries(
          Object.entries(event.activity).map((entry) => [
            entry[0],
            isEqual(previous[entry[0]], entry[1])
              ? previous[entry[0]]
              : entry[1],
          ])
        ),
      })
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
      receiveLimits(known, event.accountId, event.limits)
      return
    case 'usage':
      receiveUsage(known, event.accountId, event.usage)
      return
    case 'config':
      receiveConfig(machine, event.config)
      return
    case 'lastUsed':
      receiveLastPickedModels(machine, event.lastUsed)
      return
    case 'lastSent':
      setMachine(machine, { lastMessageAtByAccount: event.lastSent })
      return
    case 'lastEfforts':
      setMachine(machine, { lastPickedEffortByModel: event.lastEfforts })
      return
    case 'appIcon':
      setMachine(machine, { appIcon: event.appIcon })
      return
    case 'service':
      setMachine(machine, { service: event.service })
      return
    case 'bookmarks':
      receiveBookmarks(machine, event.bookmarks)
      return
    case 'projects':
      setProjects(machine, event.projects)
      return
    case 'sessions':
      setSessions(machine, event.sessions)
      return
    case 'threads':
      update({ inactiveVersion: getState().inactiveVersion + 1 })
      return
    case 'accounts':
      setAccounts(machine, event)
      return
    case 'providers':
      setMachine(machine, { providers: event.providers })
      return
    case 'worktreeStage':
      update({ worktreeStage: event.stage })
      return
    case 'warning':
      toast(event.message)
      return
    case 'setup':
      if (selected && state.selection?.projectId === event.projectId) {
        setTerminalOpen(true)
      }
      return
    case 'outbox':
      receiveOutbox(machine, event.outbox)
      return
    case 'started': {
      moveStartedPrompt(
        machine,
        event.id,
        event.session.id,
        event.session.projectId
      )
      update({
        sessions: [
          ...state.sessions.filter(
            (item) => item.machine !== machine || item.id !== event.session.id
          ),
          { ...event.session, machine },
        ],
      })
      if (
        state.selection === null ||
        !selected ||
        state.selection.pending !== event.id
      ) {
        return
      }
      const typed = draftKey(state.selection)
      const started = {
        machine,
        projectId: event.session.projectId,
        sessionId: event.session.id,
        pending: null,
      }
      if (hasPrompt(getDraft(typed))) {
        moveDraft(typed, draftKey(started))
      }
      update({
        selection: started,
        loaded: true,
        items: [],
        earlier: [],
        before: null,
        partial: '',
        requests: [],
      })
      syncUrl(true)
      return
    }
    case 'notification':
      push(machine, event.sessionId, event.message)
      return
    case 'notifier':
      setMachine(machine, { notifier: event.active })
      return
    case 'terminals':
      setMachine(machine, { terminals: event.tabs })
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
        settings:
          event.settings ??
          (state.settings.provider === event.provider
            ? state.settings
            : providerSettings(machineOf(state, machine), event.provider)),
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
    case 'request':
      update({ requests: [...state.requests, event.request] })
      return
    case 'requestDone':
      update({
        requests: state.requests.filter((item) => item.id !== event.requestId),
      })
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
