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
import { refreshPushSubscription } from '@/lib/notifications'
import { router } from '@/lib/router'
import { openSession } from '@/lib/sessions'
import { replaceSearch } from '@/lib/url'

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
listen({
  open: (machine) => {
    refreshPushSubscription(machine).catch((error: unknown) =>
      log.error('could not refresh the push subscription', error)
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
      if (event.data.panel === 'diff') {
        replaceSearch({ panel: 'diff' })
      }
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
