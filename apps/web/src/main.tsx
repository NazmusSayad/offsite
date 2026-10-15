import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { ErrorBoundary } from './components/error-boundary'
import { call, startConnection } from './connection'
import { refreshPushSubscription } from './notifications'
import { start } from './store'
import { startTerminal } from './terminal/session'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/sw.js')
    .catch((error: unknown) =>
      console.error('could not register the service worker', error)
    )

async function main(container: HTMLElement) {
  container.textContent = 'Connecting to offsite…'
  await startConnection()
  try {
    start(await call('config.get', undefined))
  } catch (error) {
    container.className = 'p-4 whitespace-pre-wrap text-red-400'
    container.textContent = `offsite could not load its config: ${String(error)}`
    return
  }
  void startTerminal()
  refreshPushSubscription().catch((error: unknown) =>
    console.error('could not refresh the push subscription', error)
  )
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}

void main(root)
