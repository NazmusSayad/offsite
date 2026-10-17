import '@/styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listen, startConnections } from '@/api/connection'
import { start } from '@/api/sync'
import { ErrorBoundary } from '@/components/error-boundary'
import { startTerminal } from '@/features/terminal/session'
import { refreshPushSubscription } from '@/lib/notifications'
import { getState, homeMachine } from '@/lib/store'
import { App } from './app'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

if ('serviceWorker' in navigator) {
  const updating = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload()
  })
  navigator.serviceWorker
    .register(import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js', {
      type: import.meta.env.DEV ? 'module' : 'classic',
    })
    .catch((error: unknown) =>
      console.error('could not register the service worker', error)
    )
}

startConnections()
listen({
  open: (machine) => {
    if (homeMachine(getState())?.id !== machine) return
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
