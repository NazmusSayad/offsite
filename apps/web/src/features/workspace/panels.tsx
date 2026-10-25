import {
  BrowserIcon,
  Folder01Icon,
  GitCompareIcon,
  MoreVerticalIcon,
  SquareTerminalIcon,
  TaskDaily01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { type ReactNode, useSyncExternalStore } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BrowserPanel } from '@/features/browser/browser-panel'
import { FilesPanel } from '@/features/files/files-panel'
import { DiffPanel } from '@/features/git/diff-panel'
import {
  getState as terminalState,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { threadTasks } from '@/features/transcript/tasks'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import { selectedActivity, type Selection, useStore } from '@/lib/store'
import { cn, mod } from '@/lib/utils'

export type Panel = 'diff' | 'tasks' | 'files' | 'browser'

type MenuOption = {
  id: string
  label: string
  title: string
  icon: IconSvgElement
  pressed: boolean
  attention: boolean
  badge: ReactNode
  detail: ReactNode
  onSelect: () => void
}

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

export function PanelMenu(
  props: ToggleProps & {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }
) {
  const options = usePanelOptions(props)

  return (
    <div className={props.className}>
      <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(toggle, 'data-[state=open]:bg-accent')}
            aria-label="More"
            title="More"
          >
            <HugeiconsIcon icon={MoreVerticalIcon} />
            {options.some((option) => option.attention) && (
              <span className="bg-muted-foreground ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          {options.map((option) => (
            <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
              <HugeiconsIcon icon={option.icon} />
              <span className="flex-1">{option.label}</span>
              {option.detail}
            </DropdownMenuItem>
          ))}
          {props.children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
    {
      id: 'browser',
      label: 'Browser',
      title: 'Browser',
      icon: BrowserIcon,
      pressed: props.panel === 'browser',
      attention: false,
      badge: null,
      detail: null,
      onSelect: () =>
        props.onPanel(props.panel === 'browser' ? null : 'browser'),
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
      {props.panel === 'browser' && (
        <BrowserPanel
          machine={props.selection.machine}
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
