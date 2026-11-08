import {
  BrowserIcon,
  GitCompareIcon,
  MoreVerticalIcon,
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
import { FaAsterisk, FaChevronRight } from 'react-icons/fa6'
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
import { taskStatuses } from '@/features/transcript/tasks'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import type { Prefs } from '@/lib/prefs'
import { deactivateSession, editSession } from '@/lib/sessions'
import {
  activityOf,
  type MachineSession,
  projectOf,
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
  dot: { color: string; status: string } | null
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
                {option.dot !== null && (
                  <span
                    className={cn(
                      'ring-background absolute top-0.5 right-0.5 size-1.5 rounded-full bg-current ring-2',
                      option.dot.color
                    )}
                  />
                )}
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
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)

  return (
    <div className="flex shrink-0 items-center gap-1">
      <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(toggle, 'data-[state=open]:bg-accent')}
            aria-label="More"
            title="More"
          >
            <HugeiconsIcon icon={MoreVerticalIcon} />
            {options.map(
              (option) =>
                option.dot !== null && (
                  <span
                    key={option.id}
                    className={cn('contents', option.dot.color)}
                  >
                    {option.id === 'terminal' && (
                      <FaChevronRight className="absolute top-0.5 left-0.5 size-2! opacity-100!" />
                    )}
                    {option.id === 'tasks' && (
                      <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-current" />
                    )}
                    {option.id === 'diff' && (
                      <FaAsterisk className="absolute right-0.5 bottom-0.5 size-2! opacity-100!" />
                    )}
                  </span>
                )
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
              {option.dot !== null && (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                  {option.dot.status}
                  <span
                    className={cn(
                      'size-1.5 rounded-full bg-current',
                      option.dot.color
                    )}
                  />
                </span>
              )}
            </DropdownMenuItem>
          ))}
          {props.children}
          {session !== undefined && (
            <ThreadMenuItems
              session={session}
              mobile={props.mobile}
              onWarn={() => setWarning(true)}
              onRename={() => setTitle(session.title)}
            />
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
          <StopWorkDialog session={session} />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ThreadMenuItems(props: {
  session: MachineSession
  mobile: boolean
  onWarn: () => void
  onRename: () => void
}) {
  const session = props.session
  const scope = useReadLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope')
  const busy = useStore((state) => {
    const activity = activityOf(state.machines, session.machine, session.id)
    return (
      activity?.running === true ||
      Object.values(activity?.tasks ?? {}).includes('running')
    )
  })

  return (
    <>
      <DropdownMenuSeparator />
      <SessionMenuItems
        session={session}
        context={false}
        mobile={props.mobile}
        onDeactivate={() => {
          if (busy) {
            props.onWarn()
            return
          }
          void deactivateSession(session.machine, session.id, scope)
        }}
        onRename={props.onRename}
      />
    </>
  )
}

function StopWorkDialog(props: { session: MachineSession | undefined }) {
  const scope = useReadLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope')

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Stop running work?</AlertDialogTitle>
        <AlertDialogDescription>
          The agent or background tasks are running. Do you really want to stop
          them?
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={() => {
            if (props.session === undefined) {
              throw new Error('session is missing')
            }
            void deactivateSession(
              props.session.machine,
              props.session.id,
              scope
            )
          }}
        >
          Stop and Mark Done
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
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
  const runningTasks = useStore(
    (state) =>
      taskStatuses(state).filter((status) => status === 'Running').length
  )
  const allTasks = useStore((state) => taskStatuses(state).length)

  return [
    {
      id: 'diff',
      label: 'Diff',
      title: 'Diff',
      icon: GitCompareIcon,
      pressed: props.panel === 'diff',
      dot: props.changed ? { color: 'text-warning', status: 'Changes' } : null,
      onSelect: () => props.onPanel(props.panel === 'diff' ? null : 'diff'),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      title: `Terminal (${mod}+\`)`,
      icon: SquareTerminalIcon,
      pressed: props.terminal,
      dot: terminalAlert
        ? { color: 'text-info', status: 'Needs you' }
        : terminalTabs > 0
          ? { color: 'text-muted-foreground', status: `${terminalTabs} open` }
          : null,
      onSelect: () => props.onTerminal(!props.terminal),
    },
    {
      id: 'tasks',
      label: 'Tasks',
      title: 'Tasks',
      icon: TaskDaily01Icon,
      pressed: props.panel === 'tasks',
      dot:
        runningTasks > 0
          ? { color: 'text-info', status: `${runningTasks} running` }
          : allTasks > 0
            ? { color: 'text-muted-foreground', status: 'None running' }
            : null,
      onSelect: () => props.onPanel(props.panel === 'tasks' ? null : 'tasks'),
    },
    {
      id: 'browser',
      label: 'Browser',
      title: 'Browser',
      icon: BrowserIcon,
      pressed: props.panel === 'browser',
      dot: null,
      onSelect: () =>
        props.onPanel(props.panel === 'browser' ? null : 'browser'),
    },
    {
      id: 'editor',
      label: 'Editor',
      title: 'Editor',
      icon: VisualStudioCodeIcon,
      pressed: false,
      dot: null,
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
