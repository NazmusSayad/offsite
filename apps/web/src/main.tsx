import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { ErrorBoundary } from './components/error-boundary'
import { listen, startConnections } from './connection'
import { home } from './machines'
import { refreshPushSubscription } from './notifications'
import { start } from './sync'
import { startTerminal } from './terminal/session'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

if ('serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/sw.js')
    .catch((error: unknown) =>
      console.error('could not register the service worker', error)
    )

startConnections()
listen({
  open: (machine) => {
    if (machine !== home) return
    refreshPushSubscription().catch((error: unknown) =>
      console.error('could not refresh the push subscription', error)
    )
  },
})
start()
void startTerminal()
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
