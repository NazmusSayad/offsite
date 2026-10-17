import {
  AlertCircleIcon,
  Folder01Icon,
  GitCompareIcon,
  PanelLeftIcon,
  SquareTerminalIcon,
  TaskDaily01Icon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment, useState, useSyncExternalStore } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useProjectName } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { Toast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Composer } from '@/features/composer/composer'
import { FilesPanel } from '@/features/files/files-panel'
import { DiffPanel } from '@/features/git/diff-panel'
import { GitActions, useGitStatus } from '@/features/git/git-menu'
import { SettingsDialog } from '@/features/settings/dialog'
import { ConnectMachine } from '@/features/sidebar/connect-machine'
import { Palette } from '@/features/sidebar/palette'
import { Sidebar } from '@/features/sidebar/sidebar'
import { TerminalPanel } from '@/features/terminal/panel'
import {
  getState as terminalState,
  setOpen as setTerminal,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { threadTasks } from '@/features/transcript/tasks'
import { TasksPanel } from '@/features/transcript/tasks-panel'
import { Transcript } from '@/features/transcript/transcript'
import {
  defaultMachine,
  dismissError,
  getState,
  machineOf,
  projectOf,
  selectedActivity,
  showPalette,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn, drag, mod } from '@/lib/utils'

const desktop = window.matchMedia('(min-width: 768px)')
const refusals = {
  outdated: {
    title: (name: string) => `${name} needs an update`,
    body: 'It runs a version of offsite that this page cannot talk to. Update offsite on that machine and restart it.',
  },
  newer: {
    title: () => 'This page is out of date',
    body: 'That machine runs a newer version of offsite. Reload this page to talk to it.',
  },
  unauthorized: {
    title: (name: string) => `${name} needs pairing`,
    body: 'Run offsite pair on that machine and open the link it prints, or enter a token in Settings → Machines.',
  },
  mismatch: {
    title: (name: string) => `${name} is a different machine now`,
    body: 'Its address now reaches another offsite machine. Fix the address in Settings → Machines, or add it as a new machine.',
  },
}

const toggle =
  'text-foreground hover:bg-accent data-[pressed=true]:bg-accent grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg border border-transparent [&_svg]:size-4 [&_svg]:opacity-80'

export function App() {
  const selection = useStore((state) => state.selection)
  const sessions = useStore((state) => state.sessions)
  const cwd = useStore((state) =>
    state.selection === null
      ? ''
      : (projectOf(state, state.selection.machine, state.selection.projectId)
          ?.path ?? '')
  )
  const machine = useStore((state) => {
    const origin = defaultMachine(state)
    return origin === null ? null : machineOf(state, origin)
  })
  const refusal =
    machine !== null &&
    (machine.status === 'outdated' ||
      machine.status === 'newer' ||
      machine.status === 'unauthorized' ||
      machine.status === 'mismatch')
      ? refusals[machine.status]
      : null
  const error = useStore((state) => state.error)
  const [sidebar, setSidebar] = useState(desktop.matches)
  const [panel, setPanel] = useState<'diff' | 'tasks' | 'files' | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem('panelWidth') ?? 540)
    if (Number.isFinite(stored) && stored >= 360) return stored
    return 540
  })
  const [terminalHeight, setTerminalHeight] = useState(280)
  const terminal = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().open
  )
  const terminalAlert = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().alerts.length > 0
  )
  const running = useStore(selectedRunning)
  const runningTasks = useStore((state) => {
    if (state.selection?.sessionId === null) return 0
    const found = threadTasks(
      [...state.earlier, ...state.items],
      selectedActivity(state)
    )
    return [...found.agents, ...found.tasks].filter(
      (item) => item.status === 'Running'
    ).length
  })
  const git = useGitStatus(
    selection?.machine ?? '',
    machine?.status === 'online' ? (selection?.projectId ?? null) : null,
    running
  )
  const session = sessions.find(
    (item) =>
      item.machine === selection?.machine && item.id === selection.sessionId
  )

  const projectTitle = useProjectName(
    selection?.machine ?? '',
    selection?.projectId ?? ''
  )
  useHotkeys('mod+k', () => showPalette(!getState().paletteOpen), {
    enableOnFormTags: true,
    preventDefault: true,
  })
  useHotkeys(
    ['mod+j', 'meta+backquote', 'ctrl+backquote'],
    (event) => {
      event.stopPropagation()
      setTerminal(!terminalState().open)
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )
  useHotkeys('mod+b', () => setSidebar((open) => !open), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  return (
    <div className="flex h-dvh text-sm">
      {sidebar && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebar(false)}
        />
      )}
      <Sidebar
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-transform motion-reduce:transition-none md:relative md:z-auto',
          sidebar ? 'translate-x-0' : '-translate-x-full md:hidden'
        )}
        onNavigate={() => {
          if (!desktop.matches) setSidebar(false)
        }}
        onHide={() => setSidebar(false)}
      />
      {!sidebar && (
        <div className="fixed top-0 left-3 z-50 flex h-(--workspace-topbar-height) items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Show sidebar"
            title={`Show sidebar (${mod}+B)`}
            onClick={() => setSidebar(true)}
          >
            <HugeiconsIcon icon={PanelLeftIcon} />
          </Button>
        </div>
      )}
      <main className="bg-background relative flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <header
            className={cn(
              'bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-3 pr-3 pl-[3.25rem] sm:pr-5',
              sidebar && 'md:pl-5',
              panel === null && 'pr-36 sm:pr-36'
            )}
          >
            {selection !== null && machine !== null && (
              <nav className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
                  <li
                    className="text-muted-foreground flex min-w-0 shrink items-center gap-1.5 font-medium"
                    title={`${machine.name}:${cwd}`}
                  >
                    <ProjectIcon
                      machine={selection.machine}
                      projectId={selection.projectId}
                      className="size-3.5"
                    />
                    <span className="max-w-40 truncate">{projectTitle}</span>
                  </li>
                  <li aria-hidden className="text-icon-muted shrink-0">
                    /
                  </li>
                  <li className="text-foreground min-w-10 flex-1 truncate font-medium">
                    {session?.title ?? 'New thread'}
                  </li>
                </ol>
              </nav>
            )}
            {selection === null && <span className="flex-1" />}
            {machine !== null &&
              (machine.status === 'connecting' ||
                machine.status === 'offline') && (
                <span className="text-warning-foreground shrink-0 text-xs">
                  {machine.status === 'connecting'
                    ? `Connecting to ${machine.name}…`
                    : `${machine.name} is offline, reconnecting…`}
                </span>
              )}
            {selection !== null && git.status !== null && (
              <GitActions
                machine={selection.machine}
                projectId={selection.projectId}
                status={git.status}
                onStatus={git.setStatus}
                onRefresh={git.refresh}
              />
            )}
          </header>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {error !== null && (
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
            )}
            {machine === null && <ConnectMachine />}
            {selection === null && machine !== null && (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <h1 className="text-foreground text-2xl font-normal tracking-tight sm:text-3xl">
                    Pick a thread, or start one
                  </h1>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Open a project from the sidebar to talk to Claude.
                  </p>
                </div>
              </div>
            )}
            {selection !== null && machine !== null && refusal !== null && (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <h1 className="text-foreground text-2xl font-normal tracking-tight sm:text-3xl">
                    {refusal.title(machine.name)}
                  </h1>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {refusal.body}
                  </p>
                </div>
              </div>
            )}
            {selection !== null && refusal === null && (
              <Fragment
                key={`${selection.machine} ${selection.sessionId ?? selection.projectId}`}
              >
                <Transcript
                  onOpenDiff={() => setPanel('diff')}
                  onOpenTask={(id) => {
                    setSelectedTask(id)
                    setPanel('tasks')
                  }}
                />
                <Composer />
              </Fragment>
            )}
          </div>
          {selection !== null && terminal && (
            <aside
              className="border-border/80 bg-background relative shrink-0 overflow-hidden border-t"
              style={{ height: terminalHeight }}
            >
              <div
                role="separator"
                aria-orientation="horizontal"
                className="group absolute inset-x-0 top-0 z-30 h-1.5 cursor-row-resize touch-none select-none"
                onPointerDown={(event) =>
                  drag(event, (next) => {
                    const max = Math.max(
                      120,
                      Math.floor(window.innerHeight * 0.8)
                    )
                    setTerminalHeight(
                      Math.min(
                        max,
                        Math.max(120, window.innerHeight - next.clientY)
                      )
                    )
                  })
                }
              >
                <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-x-0 top-0 h-px transition-colors" />
              </div>
              <TerminalPanel projectId={selection.projectId} />
            </aside>
          )}
        </div>
        {selection !== null && panel !== null && (
          <div
            className="bg-background fixed inset-0 z-40 flex flex-col md:relative md:inset-auto md:z-auto md:shrink-0 md:border-l"
            style={desktop.matches ? { width: panelWidth } : undefined}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              className="group absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize select-none md:block"
              onPointerDown={(event) =>
                drag(event, (next) => {
                  const max = Math.max(360, Math.floor(window.innerWidth * 0.7))
                  const value = Math.min(
                    max,
                    Math.max(360, window.innerWidth - next.clientX)
                  )
                  setPanelWidth(value)
                  localStorage.setItem('panelWidth', String(value))
                })
              }
            >
              <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
            </div>
            {panel === 'files' && (
              <FilesPanel
                machine={selection.machine}
                projectId={selection.projectId}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'diff' && (
              <DiffPanel
                key={`${selection.machine} ${selection.projectId}`}
                machine={selection.machine}
                projectId={selection.projectId}
                running={running}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'tasks' && (
              <TasksPanel
                machine={selection.machine}
                cwd={cwd}
                sessionId={selection.sessionId}
                selected={selectedTask}
                onSelect={setSelectedTask}
                onOpenDiff={() => setPanel('diff')}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        )}
      </main>
      {selection !== null && (
        <div className="fixed top-0 right-3 z-50 flex h-(--workspace-topbar-height) items-center gap-1">
          {panel !== null && (
            <span className="bg-foreground/15 mr-0.5 h-4 w-px" />
          )}
          <button
            className={cn(toggle, 'relative')}
            data-pressed={panel === 'tasks'}
            aria-label="Toggle tasks panel"
            title="Tasks"
            onClick={() => {
              setSelectedTask(null)
              setPanel(panel === 'tasks' ? null : 'tasks')
            }}
          >
            <HugeiconsIcon icon={TaskDaily01Icon} />
            {runningTasks > 0 && (
              <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-0.5 text-[9px] leading-none font-medium tabular-nums">
                {runningTasks}
              </span>
            )}
          </button>
          <button
            className={cn(toggle, 'relative')}
            data-pressed={terminal}
            aria-label="Toggle terminal"
            title={`Terminal (${mod}+\`)`}
            onClick={() => setTerminal(!terminal)}
          >
            <HugeiconsIcon icon={SquareTerminalIcon} />
            {terminalAlert && (
              <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" />
            )}
          </button>
          <button
            className={toggle}
            data-pressed={panel === 'files'}
            aria-label="Toggle files panel"
            title="Files"
            onClick={() => setPanel(panel === 'files' ? null : 'files')}
          >
            <HugeiconsIcon icon={Folder01Icon} />
          </button>
          <button
            className={toggle}
            data-pressed={panel === 'diff'}
            aria-label="Toggle diff panel"
            title="Diff"
            onClick={() => setPanel(panel === 'diff' ? null : 'diff')}
          >
            <HugeiconsIcon icon={GitCompareIcon} />
          </button>
        </div>
      )}
      <Palette />
      <SettingsDialog />
      <Toast />
    </div>
  )
}
