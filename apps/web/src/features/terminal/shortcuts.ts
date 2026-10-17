import { useHotkeys } from 'react-hotkeys-hook'
import { isMac } from '@/lib/utils'
import { closeTab } from './close-tab'
import {
  currentProject,
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
  const project = currentProject()?.project
  if (getState().open && project && project.activeTab !== null)
    getSession(project.activeTab).focus()
}

export function useTerminalShortcuts() {
  return useHotkeys<HTMLDivElement>(
    [newTabKey, closeTabKey, nextTabKey, previousTabKey],
    (event, hotkey) => {
      event.preventDefault()
      event.stopPropagation()
      const current = currentProject()
      if (current === null) return
      if (hotkey.hotkey === newTabKey) {
        send({ type: 'createTab', projectId: current.projectId })
        return
      }
      const project = current.project
      if (project === null || project.activeTab === null) return
      if (hotkey.hotkey === closeTabKey) {
        void closeTab(project.activeTab)
        return
      }
      let offset: number
      if (hotkey.hotkey === nextTabKey) offset = 1
      else if (hotkey.hotkey === previousTabKey) offset = -1
      else throw new Error(`unknown terminal shortcut ${hotkey.hotkey}`)
      const tabs = project.tabs.filter((tab) => !tab.minimized)
      const index = tabs.findIndex((tab) => tab.id === project.activeTab)
      const target = tabs[(index + offset + tabs.length) % tabs.length]
      if (target)
        send({ type: 'select', projectId: current.projectId, tabId: target.id })
    },
    {
      enabled: () => terminalConfig().behavior.captureShortcuts,
      enableOnFormTags: true,
      eventListenerOptions: { capture: true },
    }
  )
}
