import '@/styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listen, startConnections } from '@/api/connection'
import { home } from '@/api/machines'
import { start } from '@/api/sync'
import { ErrorBoundary } from '@/components/error-boundary'
import { startTerminal } from '@/features/terminal/session'
import { refreshPushSubscription } from '@/lib/notifications'
import { App } from './app'

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
