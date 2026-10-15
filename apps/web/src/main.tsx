import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { applyStyle, loadSettings } from './config'
import { loadGhostty } from './ghostty/runtime'
import { refreshPushSubscription } from './notifications'
import { getState, send, start, subscribe } from './session'
import { startShortcuts } from './shortcuts'
import { setThemes } from './themes'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

async function main(container: HTMLElement) {
  try {
    const [{ config, themes, platform, version }] = await Promise.all([
      loadSettings(),
      loadGhostty(),
    ])
    setThemes(themes)
    await applyStyle(config)
    start(config, platform, version)
    startShortcuts()
    selectLinkedTab()
    refreshPushSubscription().catch((error: unknown) =>
      console.error('could not refresh the push subscription', error)
    )
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  } catch (error) {
    container.className = 'p-4 whitespace-pre-wrap text-red-400'
    container.textContent = String(error)
  }
}

function selectLinkedTab() {
  const params = new URLSearchParams(location.search)
  const groupId = params.get('group')
  const tabId = params.get('tab')
  if (groupId === null || tabId === null) return
  history.replaceState(null, '', '/')
  const unsubscribe = subscribe(() => {
    if (getState().status !== 'active') return
    unsubscribe()
    send({ type: 'select', groupId: Number(groupId), tabId: Number(tabId) })
  })
}

if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/sw.js')
    .catch((error: unknown) =>
      console.error('could not register the service worker', error)
    )

void main(root)
