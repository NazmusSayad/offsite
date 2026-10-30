import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { useHotkeys } from 'react-hotkeys-hook'
import { isMac } from '@/lib/utils'
import { closeTab } from './close-tab'
import {
  currentView,
  getSession,
  getState,
  send,
  terminalConfig,
} from './session'

const newTabKey = isMac ? 'meta+t' : 'ctrl+shift+t'
const closeTabKey = isMac ? 'meta+w' : 'ctrl+shift+w'
const nextTabKey = 'ctrl+tab'
const previousTabKey = 'ctrl+shift+tab'

export function focusTerminal() {
  const tabId = currentView()?.tabId ?? null
  if (getState().open && tabId !== null) {
    getSession(tabId).focus()
  }
}

export function useTerminalShortcuts() {
  return useHotkeys<HTMLDivElement>(
    [newTabKey, closeTabKey, nextTabKey, previousTabKey],
    (event, hotkey) => {
      event.preventDefault()
      event.stopPropagation()
      const current = currentView()
      if (current === null) {
        return
      }
      if (hotkey.hotkey === newTabKey) {
        send({
          type: 'createTab',
          projectId: current.view === GLOBAL_TERMINALS ? null : current.view,
        })
        return
      }
      if (current.tabId === null) {
        return
      }
      if (hotkey.hotkey === closeTabKey) {
        void closeTab(current.tabId)
        return
      }
      let offset: number
      if (hotkey.hotkey === nextTabKey) {
        offset = 1
      } else if (hotkey.hotkey === previousTabKey) {
        offset = -1
      } else {
        throw new Error(`unknown terminal shortcut ${hotkey.hotkey}`)
      }
      const tabs = current.tabs
      const index = tabs.findIndex((tab) => tab.id === current.tabId)
      const target = tabs[(index + offset + tabs.length) % tabs.length]
      if (target) {
        send({ type: 'select', view: current.view, tabId: target.id })
      }
    },
    {
      enabled: () => terminalConfig().behavior.captureShortcuts,
      enableOnFormTags: true,
      eventListenerOptions: { capture: true },
    }
  )
}
