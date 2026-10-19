import {
  AlertCircleIcon,
  Folder01Icon,
  GitCompareIcon,
  SquareTerminalIcon,
  TaskDaily01Icon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSyncExternalStore } from 'react'
import { LastUsedMenu, type MenuOption } from '@/components/last-used-menu'
import { Button } from '@/components/ui/button'
import { FilesPanel } from '@/features/files/files-panel'
import { DiffPanel } from '@/features/git/diff-panel'
import {
  getState as terminalState,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { threadTasks } from '@/features/transcript/tasks'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import {
  dismissError,
  selectedActivity,
  type Selection,
  useStore,
} from '@/lib/store'
import { cn, mod } from '@/lib/utils'

export type Panel = 'diff' | 'tasks' | 'files'

const toggle =
  'text-foreground hover:bg-accent data-[pressed=true]:bg-accent relative grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg border border-transparent [&_svg]:size-4 [&_svg]:opacity-80'

type ToggleProps = {
  className: string
  selection: Selection
  panel: Panel | null
  terminal: boolean
  changed: boolean
  onPanel: (panel: Panel | null) => void
  onTerminal: (open: boolean) => void
}

export function PanelToggles(props: ToggleProps) {
  const options = usePanelOptions(props)

  return (
    <div className={props.className}>
      {options.map((option) => (
        <button
          key={option.id}
          className={toggle}
          data-pressed={option.pressed}
          aria-label={option.label}
          title={option.title}
          onClick={option.onSelect}
        >
          <HugeiconsIcon icon={option.icon} />
          {option.badge}
        </button>
      ))}
    </div>
  )
}

export function PanelMenu(props: ToggleProps) {
  const options = usePanelOptions(props)

  return (
    <LastUsedMenu
      storageKey="mobilePanel"
      className={props.className}
      buttonClassName={toggle}
      options={options}
    />
  )
}

function usePanelOptions(props: ToggleProps): [MenuOption, ...MenuOption[]] {
  const terminalAlert = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().alerts.length > 0
  )
  const terminalTabs = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().layout[props.selection.projectId]?.tabs.length ?? 0
  )
  const runningTasks = useStore((state) => {
    if (state.selection?.sessionId === null) {
      return 0
    }
    const found = threadTasks(
      [...state.earlier, ...state.items],
      selectedActivity(state)
    )
    return [...found.agents, ...found.tasks].filter(
      (item) => item.status === 'Running'
    ).length
  })

  return [
    {
      id: 'diff',
      label: 'Diff',
      title: 'Diff',
      icon: GitCompareIcon,
      pressed: props.panel === 'diff',
      attention: props.changed,
      badge: props.changed && (
        <span className="bg-muted-foreground ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2" />
      ),
      detail: props.changed && (
        <span className="bg-muted-foreground size-1.5 rounded-full" />
      ),
      onSelect: () => props.onPanel(props.panel === 'diff' ? null : 'diff'),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      title: `Terminal (${mod}+\`)`,
      icon: SquareTerminalIcon,
      pressed: props.terminal,
      attention: terminalAlert,
      badge: terminalTabs > 0 && (
        <span
          className={cn(
            'absolute top-0 right-0 grid h-3 min-w-3 place-items-center rounded-full px-0.5 text-[8px] leading-none font-medium tabular-nums',
            terminalAlert
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))]'
          )}
        >
          {terminalTabs}
        </span>
      ),
      detail: terminalTabs > 0 && (
        <span
          className={cn(
            'text-xs tabular-nums',
            terminalAlert ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {terminalTabs}
        </span>
      ),
      onSelect: () => props.onTerminal(!props.terminal),
    },
    {
      id: 'tasks',
      label: 'Tasks',
      title: 'Tasks',
      icon: TaskDaily01Icon,
      pressed: props.panel === 'tasks',
      attention: runningTasks > 0,
      badge: runningTasks > 0 && (
        <span className="text-foreground absolute top-0 right-0 grid h-3 min-w-3 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-0.5 text-[8px] leading-none font-medium tabular-nums">
          {runningTasks}
        </span>
      ),
      detail: runningTasks > 0 && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {runningTasks}
        </span>
      ),
      onSelect: () => props.onPanel(props.panel === 'tasks' ? null : 'tasks'),
    },
    {
      id: 'files',
      label: 'Files',
      title: 'Files',
      icon: Folder01Icon,
      pressed: props.panel === 'files',
      attention: false,
      badge: null,
      detail: null,
      onSelect: () => props.onPanel(props.panel === 'files' ? null : 'files'),
    },
  ]
}

export function PanelView(props: {
  panel: Panel
  selection: Selection
  cwd: string
  running: boolean
  selectedTask: string | null
  onSelectTask: (id: string | null) => void
  onPanel: (panel: Panel | null) => void
}) {
  return (
    <>
      {props.panel === 'files' && (
        <FilesPanel
          machine={props.selection.machine}
          projectId={props.selection.projectId}
          onClose={() => props.onPanel(null)}
        />
      )}
      {props.panel === 'diff' && (
        <DiffPanel
          key={`${props.selection.machine} ${props.selection.projectId}`}
          machine={props.selection.machine}
          projectId={props.selection.projectId}
          running={props.running}
          onClose={() => props.onPanel(null)}
        />
      )}
      {props.panel === 'tasks' && (
        <TasksPanel
          machine={props.selection.machine}
          cwd={props.cwd}
          sessionId={props.selection.sessionId}
          selected={props.selectedTask}
          onSelect={props.onSelectTask}
          onOpenDiff={() => props.onPanel('diff')}
          onClose={() => props.onPanel(null)}
        />
      )}
    </>
  )
}

export function ErrorBanner() {
  const error = useStore((state) => state.error)
  if (error === null) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-4 pt-3">
      <div className="border-error/30 bg-background/80 text-error-foreground pointer-events-auto flex w-fit max-w-[min(48rem,100%)] items-start gap-2 rounded-xl border px-3.5 py-3 text-sm backdrop-blur-md">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          className="text-error mt-0.5 size-4 shrink-0"
        />
        <div className="line-clamp-3 min-w-0 flex-1 whitespace-pre-wrap">
          {error}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss"
          onClick={dismissError}
        >
          <HugeiconsIcon icon={XIcon} />
        </Button>
      </div>
    </div>
  )
}
