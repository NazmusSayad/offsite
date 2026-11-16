import '@/styles/index.css'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { listen, startConnections } from '@/api/connection'
import { start } from '@/api/sync'
import { App } from '@/app'
import { ErrorBoundary } from '@/components/error-boundary'
import { warmHighlighter } from '@/components/markdown/warm-highlighter'
import { loadDrafts } from '@/features/composer/drafts'
import { startTerminal } from '@/features/terminal/session'
import { startBrowserUpdates } from '@/lib/browser-update'
import { logger, startLogging } from '@/lib/log'
import {
  alreadySeen,
  dropSeenNotifications,
  refreshPushSubscription,
} from '@/lib/notifications'
import { startReads } from '@/lib/reads'
import { router } from '@/lib/router'
import { startSeen } from '@/lib/seen'
import { openSession } from '@/lib/sessions'

const log = logger.withTag('app')

startLogging()

const root = document.getElementById('root')
if (!root) {
  throw new Error('root element missing')
}

addEventListener(
  'keydown',
  (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
      event.preventDefault()
    }
  },
  { capture: true }
)

await loadDrafts()
startConnections()
startReads()
startSeen()
listen({
  open: (machine) => {
    refreshPushSubscription(machine).catch((error: unknown) =>
      log.error('could not refresh the push subscription', error)
    )
    dropSeenNotifications(machine).catch((error: unknown) =>
      log.error('could not remove notifications that were already seen', error)
    )
  },
})
start()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'openSession') {
      openSession({
        machine: event.data.machine,
        projectId: event.data.project,
        worktreeId: event.data.worktree,
        sessionId: event.data.sessionId,
        pending: null,
      })
    }
    if (event.data.type === 'watching') {
      event.ports[0].postMessage(
        alreadySeen(event.data.machine, event.data.sessionId)
      )
    }
  })
}
startBrowserUpdates().catch((error: unknown) =>
  log.error('could not register the service worker', error)
)

void startTerminal()
router.routeTree.update({ component: App })
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>
)
warmHighlighter().catch((error: unknown) =>
  log.error('could not prepare code highlighting', error)
)
