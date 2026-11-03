import {
  BrowserIcon,
  GitCompareIcon,
  MoreHorizontalIcon,
  VisualStudioCodeIcon,
  SquareTerminalIcon,
  TaskDaily01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  lazy,
  type ReactNode,
  Suspense,
  useState,
  useSyncExternalStore,
} from 'react'
import { useReadLocalStorage } from 'usehooks-ts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { BrowserPanel } from '@/features/browser/browser-panel'
import { useEditorShortcut } from '@/features/files/use-editor-shortcut'
import { SessionMenuItems } from '@/features/sidebar/session-menu-items'
import {
  getState as terminalState,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { threadTasks } from '@/features/transcript/tasks'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import type { Prefs } from '@/lib/prefs'
import { deactivateSession, editSession } from '@/lib/sessions'
import {
  activityOf,
  type MachineSession,
  selectedActivity,
  type Selection,
  showEditor,
  updatePrefs,
  useStore,
} from '@/lib/store'
import { cn, mod } from '@/lib/utils'

export type Panel = 'diff' | 'tasks' | 'browser'

const DiffPanel = lazy(async () => ({
  default: (await import('@/features/git/diff-panel')).DiffPanel,
}))

type MenuOption = {
  id: Prefs['toolbar'][number]
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
  selection: Selection
  panel: Panel | null
  terminal: boolean
  changed: boolean
  onPanel: (panel: Panel | null) => void
  onTerminal: (open: boolean) => void
}

export function PanelToggles(props: ToggleProps & { children: ReactNode }) {
  const options = usePanelOptions(props)
  const prefs = useStore((state) => state.prefs)
  const editorClosed = useStore((state) => state.editor === null)
  useEditorShortcut(
    () =>
      showEditor({
        machine: props.selection.machine,
        projectId: props.selection.projectId,
      }),
    editorClosed
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-1">
          {options
            .filter((option) => prefs.toolbar.includes(option.id))
            .map((option) => (
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
          {props.children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {options.map((option) => (
          <ContextMenuCheckboxItem
            key={option.id}
            checked={prefs.toolbar.includes(option.id)}
            onCheckedChange={(checked) =>
              updatePrefs({
                ...prefs,
                toolbar: checked
                  ? [...prefs.toolbar, option.id]
                  : prefs.toolbar.filter((id) => id !== option.id),
              })
            }
          >
            <HugeiconsIcon icon={option.icon} />
            {option.label}
          </ContextMenuCheckboxItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function PanelMenu(
  props: ToggleProps & {
    mobile: boolean
    session: MachineSession | undefined
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }
) {
  const session = props.session
  const toolbar = useStore((state) => state.prefs.toolbar)
  const options = usePanelOptions(props).filter(
    (option) => props.mobile || !toolbar.includes(option.id)
  )
  const scope = useReadLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope')
  const busy = useStore((state) => {
    if (session === undefined) {
      return false
    }
    const activity = activityOf(state.machines, session.machine, session.id)
    return (
      activity?.running === true ||
      Object.values(activity?.tasks ?? {}).includes('running')
    )
  })
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)

  function makeInactive() {
    if (session === undefined) {
      throw new Error('session is missing')
    }
    void deactivateSession(session.machine, session.id, scope)
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(toggle, 'data-[state=open]:bg-accent')}
            aria-label="More"
            title="More"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
            {options.some((option) => option.attention) && (
              <span className="bg-muted-foreground ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full ring-2" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 [&>[data-slot=dropdown-menu-separator]:first-child]:hidden"
          align="end"
        >
          {options.map((option) => (
            <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
              <HugeiconsIcon icon={option.icon} />
              <span className="flex-1">{option.label}</span>
              {option.detail}
            </DropdownMenuItem>
          ))}
          {props.children}
          {session !== undefined && (
            <>
              <DropdownMenuSeparator />
              <SessionMenuItems
                session={session}
                context={false}
                mobile={props.mobile}
                onDeactivate={() => {
                  if (busy) {
                    setWarning(true)
                    return
                  }
                  makeInactive()
                }}
                onRename={() => setTitle(session.title)}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {session !== undefined && title !== null && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setTitle(null)
            }
          }}
        >
          <DialogContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const value = title.trim()
                setTitle(null)
                if (value !== '' && value !== session.title) {
                  void editSession(session.machine, session.id, {
                    title: value,
                  })
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Rename thread</DialogTitle>
              </DialogHeader>
              <Input
                aria-label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTitle(null)}
                >
                  Cancel
                </Button>
                <Button type="submit">Rename</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog open={warning} onOpenChange={setWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop running work?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent or background tasks are running. Do you really want to
              stop them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={makeInactive}>
              Stop and Mark Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
    () =>
      terminalState().layout.tabs.filter(
        (tab) => tab.projectId === props.selection.projectId
      ).length
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
    {
      id: 'editor',
      label: 'Editor',
      title: 'Editor',
      icon: VisualStudioCodeIcon,
      pressed: false,
      attention: false,
      badge: null,
      detail: null,
      onSelect: () =>
        showEditor({
          machine: props.selection.machine,
          projectId: props.selection.projectId,
        }),
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
      {props.panel === 'browser' && (
        <BrowserPanel
          machine={props.selection.machine}
          onClose={() => props.onPanel(null)}
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
          />
        </Suspense>
      )}
      {props.panel === 'tasks' && (
        <TasksPanel
          machine={props.selection.machine}
          cwd={props.cwd}
          sessionId={props.selection.sessionId}
          selected={props.selectedTask}
          onSelect={props.onSelectTask}
          onClose={() => props.onPanel(null)}
        />
      )}
    </>
  )
}
