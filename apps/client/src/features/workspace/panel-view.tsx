import { lazy, Suspense } from 'react'
import { BrowserPanel } from '@/features/browser/browser-panel'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import type { Panel } from '@/features/workspace/panels'
import { projectOf, type Selection, useStore } from '@/lib/store'

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
