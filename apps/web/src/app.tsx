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
import { ProjectIcon } from '@/components/icons'
import { Toast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Composer } from '@/composer/composer'
import { FilesPanel } from '@/files/files-panel'
import { DiffPanel } from '@/git/diff-panel'
import { GitActions, useGitStatus } from '@/git/git-menu'
import { cn, drag, mod } from '@/lib/utils'
import { useProjectName } from '@/projects'
import { SettingsDialog } from '@/settings/dialog'
import { Palette } from '@/sidebar/palette'
import { Sidebar } from '@/sidebar/sidebar'
import {
  dismissError,
  getState,
  showPalette,
  selectedRunning,
  useStore,
} from '@/store'
import { TerminalPanel } from '@/terminal/panel'
import {
  getState as terminalState,
  setOpen as setTerminal,
  subscribe as subscribeTerminal,
} from '@/terminal/session'
import { threadTasks } from '@/transcript/tasks'
import { TasksPanel } from '@/transcript/tasks-panel'
import { Transcript } from '@/transcript/transcript'

const desktop = window.matchMedia('(min-width: 768px)')
const toggle =
  'text-foreground hover:bg-accent data-[pressed=true]:bg-accent grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg border border-transparent [&_svg]:size-4 [&_svg]:opacity-80'

export function App() {
  const selection = useStore((state) => state.selection)
  const sessions = useStore((state) => state.sessions)
  const connected = useStore((state) => state.connected)
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
    const sessionId = state.selection?.sessionId ?? null
    if (sessionId === null) return 0
    const found = threadTasks(
      [...state.earlier, ...state.messages],
      state.activity[sessionId]
    )
    return [...found.agents, ...found.tasks].filter(
      (item) => item.status === 'Running'
    ).length
  })
  const git = useGitStatus(selection?.cwd ?? null, running)
  const session = sessions.find((item) => item.id === selection?.sessionId)

  const projectTitle = useProjectName(selection?.cwd ?? '')
  useHotkeys('mod+k', () => showPalette(!getState().paletteOpen), {
    enableOnFormTags: true,
    preventDefault: true,
  })
  useHotkeys(
    'mod+j',
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
            {selection !== null && (
              <nav className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
                  <li
                    className="text-muted-foreground flex min-w-0 shrink items-center gap-1.5 font-medium"
                    title={selection.cwd}
                  >
                    <ProjectIcon cwd={selection.cwd} className="size-3.5" />
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
            {!connected && (
              <span className="text-warning-foreground shrink-0 text-xs">
                Reconnecting…
              </span>
            )}
            {selection !== null && git.status !== null && (
              <GitActions
                cwd={selection.cwd}
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
            {selection === null && (
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
            {selection !== null && (
              <Fragment key={selection.sessionId ?? selection.cwd}>
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
              <TerminalPanel cwd={selection.cwd} />
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
              <FilesPanel cwd={selection.cwd} onClose={() => setPanel(null)} />
            )}
            {panel === 'diff' && (
              <DiffPanel
                cwd={selection.cwd}
                running={running}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'tasks' && (
              <TasksPanel
                cwd={selection.cwd}
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
            title={`Terminal (${mod}+J)`}
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
