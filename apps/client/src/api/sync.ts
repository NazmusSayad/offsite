import {
  DEFAULT_CLAUDE_PERMISSION_MODE,
  DEFAULT_PROVIDER,
} from '@offsite/core/config'
import type { Project, Worktree } from '@offsite/core/projects'
import type { ServerEvent, SyncSnapshot } from '@offsite/core/protocol'
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
import {
  answerAwake,
  dismissNotifications,
  rememberBrowser,
  showNotificationHere,
} from '@/lib/notifications'
import { moveStartedPrompt, receiveOutbox } from '@/lib/outbox'
import { loadPrefs } from '@/lib/prefs'
import { reportPresence, startPresence } from '@/lib/presence'
import { withAnswers, withDeadline } from '@/lib/requests'
import { router } from '@/lib/router'
import { restartSeen } from '@/lib/seen'
import { closeSession, loadSession, openSession } from '@/lib/sessions'
import {
  createAppStore,
  draftKey,
  getState,
  machineOf,
  setMachine,
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
import { errorMessage } from '@/lib/utils'
import { connectMachine, listen } from './connection'
import { flushDelta, queueDelta } from './delta'
import { receiveConfig, receiveLastPickedModels } from './machine-config'
import {
  addMachine,
  loadMachines,
  machineKey,
  pairingFromUrl,
  persistMachines,
  receiveMachines,
  restoreMachine,
  restoreProjects,
  shareMachines,
  syncListedMachines,
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
    worktrees: [],
    prefs: loadPrefs(),
    paletteOpen: false,
    hotkeyHints: false,
    browserUpdate: false,
    settingsOpen: false,
    settingsPage: 'General',
    editor: null,
    exporting: null,
    removingWorktree: null,
    pairingFailure: null,
    settingsAccount: null,
    settingsListing: 'settings',
    settingsMachine: stored.at(0)?.id ?? null,
    usageOpen: false,
    bookmarksOpen: false,
    focus: null,
    usage: {},
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
    worktreeState: null,
    context: null,
    capabilities: null,
    sentAt: 0,
  })
  applyTheme()
  listen({
    open: (machine, url, snapshot) => {
      setMachine(machine, { via: url })
      resync(machine, snapshot)
      reportPresence(machine)
    },
    close: (machine) => {
      const known = getState().machines.find((item) => item.id === machine)
      if (known !== undefined && known.status !== 'offline') {
        setMachine(machine, { status: 'offline', via: null })
      }
    },
    unpaired: (machine) =>
      setMachine(machine, { status: 'unpaired', via: null }),
    event: receive,
  })
  startPresence()
  rememberBrowser()
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
      current.worktreeId !== next.worktreeId ||
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
    const pairing = pairingFromUrl()
    if (pairing !== null) {
      await addMachine([pairing.address], pairing.code)
    }
  } catch (error) {
    log.warn('the pairing link failed:', error)
    update({ pairingFailure: errorMessage(error) })
  }
  await syncListedMachines()
}

function resync(machine: string, snapshot: SyncSnapshot) {
  try {
    const known = getState().machines.find((item) => item.id === machine)
    if (known === undefined) {
      return
    }
    setMachine(machine, {
      status: 'online',
      name: known.listName ?? known.label ?? snapshot.hostname,
      hostname: snapshot.hostname,
      system: {
        defaults: snapshot.defaults,
        platform: snapshot.platform,
        defaultShell: snapshot.defaultShell,
        defaultClaudeBaseDir: snapshot.defaultClaudeBaseDir,
        homeDir: snapshot.homeDir,
        version: snapshot.version,
      },
      activity: snapshot.activity,
      providers: snapshot.providers,
      terminals: snapshot.terminals,
      appIcon: snapshot.appIcon,
      service: snapshot.service,
      cleanup: snapshot.cleanup,
      lastMessageAtByAccount: snapshot.lastSent,
      lastPickedEffortByModel: snapshot.lastEfforts,
    })
    receiveBookmarks(machine, snapshot.bookmarks)
    receiveOutbox(machine, snapshot.outbox)
    settleDisconnected(machine)
    setProjects(machine, snapshot.projects)
    setWorktrees(machine, snapshot.worktrees)
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

function setWorktrees(machine: string, worktrees: Worktree[]) {
  update({
    worktrees: [
      ...getState().worktrees.filter((item) => item.machine !== machine),
      ...worktrees.map((worktree) => ({ ...worktree, machine })),
    ],
  })
}

function reopenThread(machine: string) {
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId !== null) {
    loadSession(selection, selection.sessionId, false, null)
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
    case 'cleanup':
      setMachine(machine, { cleanup: event.cleanup })
      return
    case 'bookmarks':
      receiveBookmarks(machine, event.bookmarks)
      return
    case 'projects':
      setProjects(machine, event.projects)
      return
    case 'worktrees':
      setWorktrees(machine, event.worktrees)
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
      toast.warning(event.message)
      return
    case 'setup':
      if (
        selected &&
        state.selection?.projectId === event.projectId &&
        state.selection.worktreeId === event.worktreeId
      ) {
        setTerminalOpen(true)
      }
      return
    case 'outbox':
      receiveOutbox(machine, event.outbox)
      return
    case 'started': {
      moveStartedPrompt(machine, event.id, event.session.id, event.session)
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
        worktreeId: event.session.worktreeId,
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
      showNotificationHere(machine, event.notification, event.pushed).catch(
        (error: unknown) => log.error('could not show a notification', error)
      )
      return
    case 'notification.ask':
      restartSeen(machine, event.sessionId)
      answerAwake(machine, event.id).catch((error: unknown) =>
        log.error('could not answer a notification', error)
      )
      return
    case 'notification.dismiss':
      dismissNotifications(machine, event.tag).catch((error: unknown) =>
        log.error('could not remove a notification', error)
      )
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
    case 'requestDeadline':
      update({
        requests: withDeadline(state.requests, event.requestId, event.at),
      })
      return
    case 'requestAnswers':
      update({
        requests: withAnswers(state.requests, event.requestId, event.answers),
      })
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
