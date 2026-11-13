import { useSearch } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { BrowserPanel } from '@/features/browser/browser-panel'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import type { Panel } from '@/features/workspace/panels'
import { projectOf, type Selection, useStore } from '@/lib/store'

const PullRequestsPanel = lazy(async () => ({
  default: (await import('@/features/pull-requests/pull-requests-panel'))
    .PullRequestsPanel,
}))

const PullRequestView = lazy(async () => ({
  default: (await import('@/features/pull-requests/pull-request-view'))
    .PullRequestView,
}))

const DiffPanel = lazy(async () => ({
  default: (await import('@/features/git/diff-panel')).DiffPanel,
}))

export function PanelView(props: {
  panel: Panel
  selection: Selection
  running: boolean
  selectedTask: string | null
  onSelectTask: (id: string | null) => void
  onPanel: (panel: Panel | null) => void
  mobile: boolean
}) {
  const cwd = useStore(
    (state) =>
      projectOf(state, props.selection.machine, props.selection.projectId)
        ?.path ?? ''
  )
  const pull = useSearch({
    from: '__root__',
    select: (search) => search.pull ?? null,
  })
  return (
    <>
      {props.panel === 'browser' && (
        <BrowserPanel
          machine={props.selection.machine}
          onClose={() => props.onPanel(null)}
          mobile={props.mobile}
        />
      )}
      {props.panel === 'diff' && (
        <Suspense>
          <DiffPanel
            key={`${props.selection.machine} ${props.selection.projectId}`}
            machine={props.selection.machine}
            projectId={props.selection.projectId}
            running={props.running}
            onClose={() => props.onPanel(null)}
            mobile={props.mobile}
          />
        </Suspense>
      )}
      {props.panel === 'pulls' && (
        <Suspense>
          <PullRequestsPanel
            key={`${props.selection.machine} ${props.selection.projectId}`}
            machine={props.selection.machine}
            projectId={props.selection.projectId}
            running={props.running}
            onClose={() => props.onPanel(null)}
            mobile={props.mobile}
          />
        </Suspense>
      )}
      {props.panel === 'pull' && pull !== null && (
        <Suspense>
          <PullRequestView
            key={pull}
            machine={props.selection.machine}
            projectId={props.selection.projectId}
            url={pull}
            running={props.running}
            onClose={() => props.onPanel(null)}
            mobile={props.mobile}
          />
        </Suspense>
      )}
      {props.panel === 'tasks' && (
        <TasksPanel
          machine={props.selection.machine}
          cwd={cwd}
          sessionId={props.selection.sessionId}
          selected={props.selectedTask}
          onSelect={props.onSelectTask}
          onClose={() => props.onPanel(null)}
          mobile={props.mobile}
        />
      )}
    </>
  )
}
