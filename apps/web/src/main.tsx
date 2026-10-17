import '@/styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listen, startConnections } from '@/api/connection'
import { start } from '@/api/sync'
import { ErrorBoundary } from '@/components/error-boundary'
import { startTerminal } from '@/features/terminal/session'
import { refreshPushSubscription } from '@/lib/notifications'
import { openSession } from '@/lib/sessions'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

if ('serviceWorker' in navigator) {
  const updating = navigator.serviceWorker.controller !== null
  const pwa = document.querySelector('link[rel="manifest"]') !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload()
  })
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type !== 'openSession') return
    openSession({
      machine: event.data.machine,
      projectId: event.data.project,
      sessionId: event.data.sessionId,
    })
  })
  navigator.serviceWorker
    .register(
      import.meta.env.DEV ? '/dev-sw.js?dev-sw' : pwa ? '/sw.js?pwa' : '/sw.js',
      {
        type: import.meta.env.DEV ? 'module' : 'classic',
      }
    )
    .catch((error: unknown) =>
      console.error('could not register the service worker', error)
    )
}

startConnections()
listen({
  open: (machine) => {
    refreshPushSubscription(machine).catch((error: unknown) =>
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
