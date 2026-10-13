import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { startBackgrounds } from './backgrounds'
import { applyStyle, loadSettings } from './config'
import { loadGhostty } from './ghostty/runtime'
import {
  pushSubscribed,
  pushSupport,
  refreshPushSubscription,
} from './notifications'
import { getState, send, start, subscribe } from './session'
import { SettingsPage } from './settings-page'
import { startShortcuts } from './shortcuts'
import { setThemes } from './themes'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

async function main(container: HTMLElement) {
  try {
    const [{ config, defaults, themes, platform, version }] = await Promise.all(
      [loadSettings(), loadGhostty()]
    )
    setThemes(themes)
    await applyStyle(config)
    if (location.pathname === '/settings') {
      document.title = 'Settings'
      if (pushSupport() === 'supported')
        pushSubscribed()
          .then((subscribed) => {
            if (subscribed) connectSettingsPage()
          })
          .catch((error: unknown) =>
            console.error('could not read the push subscription', error)
          )
      createRoot(container).render(
        <StrictMode>
          <SettingsPage
            config={config}
            defaults={defaults}
            platform={platform}
          />
        </StrictMode>
      )
      return
    }
    start(config, platform, version)
    startShortcuts()
    startBackgrounds()
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

function connectSettingsPage() {
  const socket = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  )
  const timer = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'ping' }))
  }, 30_000)
  socket.onclose = () => {
    window.clearInterval(timer)
    window.setTimeout(connectSettingsPage, 1000)
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
