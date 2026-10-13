import { getSession, getState, subscribe } from './session'
import { showToast } from './toast'

export function uploadGroupBackground(groupId: number, file: File) {
  void sendGroupBackground(groupId, 'PUT', file)
}

export function removeGroupBackground(groupId: number) {
  void sendGroupBackground(groupId, 'DELETE', null)
}

async function sendGroupBackground(
  groupId: number,
  method: 'PUT' | 'DELETE',
  file: File | null
) {
  try {
    const response = await fetch(`/api/groups/${groupId}/background`, {
      method,
      headers: file === null ? {} : { 'Content-Type': file.type },
      body: file,
    })
    if (!response.ok) throw new Error(await response.text())
  } catch (error) {
    showToast(
      `Background not updated: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function startBackgrounds() {
  let applied = getState()
  subscribe(() => {
    const state = getState()
    if (state.layout === applied.layout && state.config === applied.config)
      return
    applied = state
    const behavior = state.config.behavior
    for (const group of state.layout.groups) {
      const file = group.background ?? behavior.backgroundImage
      for (const tab of group.tabs)
        getSession(tab.id).setBackground(
          file === null
            ? null
            : {
                url: `/api/backgrounds/${file}`,
                opacity: behavior.backgroundOpacity,
                fit: behavior.backgroundFit,
              }
        )
    }
  })
}
