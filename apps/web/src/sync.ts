import type { ServerEvent, Snapshot } from '@server/protocol'
import { getDraftSettings, saveDraftSettings } from './composer/drafts'
import { call, isConnected, listen } from './connection'
import { notify, push } from './notifications'
import {
  createAppStore,
  getState,
  receiveConfig,
  refreshAccounts,
  refreshCapabilities,
  setAccounts,
  showError,
  update,
} from './store'
import { applyTheme } from './theme'
import { selectionFromUrl, syncUrl } from './url'

export function start(snapshot: Snapshot) {
  const selection = selectionFromUrl()
  createAppStore({
    connected: isConnected(),
    sessions: snapshot.sessions,
    projects: snapshot.projects,
    accounts: [],
    paletteOpen: false,
    settingsOpen: false,
    settingsPage: 'General',
    config: snapshot.config,
    configError: null,
    system: {
      defaults: snapshot.defaults,
      platform: snapshot.platform,
      version: snapshot.version,
      defaultShell: snapshot.defaultShell,
    },
    activity: snapshot.activity,
    unseen: [],
    selection,
    loaded: selection?.sessionId === null,
    messages: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      (selection === null
        ? null
        : getDraftSettings(selection.sessionId ?? selection.cwd)) ??
      snapshot.config.composer,
    draft: null,
    context: null,
    capabilities: null,
    error: null,
  })
  applyTheme()
  listen({
    open: () => void resync(),
    close: () => update({ connected: false }),
    event: receive,
  })
  reopenThread()
  void refreshAccounts()
  void refreshCapabilities()
}

async function resync() {
  update({ connected: true })
  reopenThread()
  void refreshAccounts()
  try {
    const snapshot = await call('sync', undefined)
    update({
      projects: snapshot.projects,
      sessions: snapshot.sessions,
      activity: snapshot.activity,
    })
    receiveConfig(snapshot.config)
  } catch (error) {
    showError(error)
  }
}

function reopenThread() {
  const selection = getState().selection
  if (selection !== null && selection.sessionId !== null)
    call('sessions.open', {
      cwd: selection.cwd,
      sessionId: selection.sessionId,
    }).catch(showError)
}

function receive(event: ServerEvent) {
  const state = getState()
  const current = state.selection?.sessionId ?? null
  switch (event.type) {
    case 'activity': {
      const running =
        current !== null && event.activity[current]?.running === true
      const finished = Object.keys(state.activity).filter(
        (id) =>
          state.activity[id].running && event.activity[id]?.running !== true
      )
      const waiting = Object.keys(event.activity).filter(
        (id) =>
          event.activity[id].waiting && state.activity[id]?.waiting !== true
      )
      notify(finished, 'finished')
      notify(waiting, 'needs your input')
      update({
        activity: event.activity,
        partial: running ? state.partial : '',
        unseen: [
          ...state.unseen,
          ...finished.filter(
            (id) => id !== current && !state.unseen.includes(id)
          ),
        ],
      })
      return
    }
    case 'limits':
      update({
        accounts: state.accounts.map((item) =>
          item.id === event.accountId ? { ...item, limits: event.limits } : item
        ),
      })
      return
    case 'config':
      receiveConfig(event.config)
      return
    case 'projects':
      update({ projects: event.projects })
      return
    case 'sessions':
      update({ sessions: event.sessions })
      return
    case 'accounts':
      setAccounts(event.accounts)
      return
    case 'started':
      saveDraftSettings(event.sessionId, getDraftSettings(event.cwd))
      saveDraftSettings(event.cwd, null)
      if (
        state.selection === null ||
        state.selection.cwd !== event.cwd ||
        state.selection.sessionId !== null
      )
        return
      update({
        selection: { cwd: event.cwd, sessionId: event.sessionId },
        loaded: true,
        messages: [],
        earlier: [],
        before: null,
        partial: '',
        requests: [],
        queue: [],
      })
      syncUrl()
      return
    case 'notification':
      push(event.sessionId, event.message)
      return
  }
  if (event.sessionId !== current) return
  switch (event.type) {
    case 'history':
      update({
        loaded: true,
        messages: event.messages,
        earlier: [],
        before: event.before,
        requests: event.requests,
        queue: event.queue,
        settings: event.settings ?? state.settings,
        context: event.context,
        partial: '',
      })
      if (event.settings !== null)
        saveDraftSettings(event.sessionId, event.settings)
      return
    case 'context':
      update({ context: event.context })
      return
    case 'message':
      if (state.messages.some((item) => item.uuid === event.message.uuid))
        return
      update({
        messages: [...state.messages, event.message],
        partial: event.message.type === 'assistant' ? '' : state.partial,
      })
      return
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
      saveDraftSettings(event.sessionId, settings)
    }
  }
}
