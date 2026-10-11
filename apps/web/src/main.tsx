import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { applyStyle, loadSettings } from './config'
import { loadGhostty } from './ghostty/runtime'
import { start } from './session'
import { SettingsPage } from './settings-page'
import { startShortcuts } from './shortcuts'
import { setThemes } from './themes'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

async function main(container: HTMLElement) {
  try {
    const [{ config, defaults, themes, platform }] = await Promise.all([
      loadSettings(),
      loadGhostty(),
    ])
    setThemes(themes)
    await applyStyle(config)
    if (location.pathname === '/settings') {
      document.title = 'Settings'
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
    start(config, platform)
    startShortcuts()
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

void main(root)
