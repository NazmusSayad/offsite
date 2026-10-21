import { MoreVerticalIcon, PanelLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSearch } from '@tanstack/react-router'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocalStorage } from 'usehooks-ts'
import { useProjectName } from '@/api/projects'
import { machineIcons, ProjectIcon } from '@/components/icons'
import { Toast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Composer } from '@/features/composer/composer'
import {
  GitActions,
  GitCommandDialog,
  GitMenuItems,
  useGitCommands,
  useGitStatus,
} from '@/features/git/git-menu'
import { GitToast } from '@/features/git/git-toast'
import { SettingsDialog } from '@/features/settings/dialog'
import { MobileSettings } from '@/features/settings/mobile'
import { ConnectMachine } from '@/features/sidebar/connect-machine'
import { Palette } from '@/features/sidebar/palette'
import { Sidebar } from '@/features/sidebar/sidebar'
import { TerminalPanel } from '@/features/terminal/panel'
import {
  getState as terminalState,
  setOpen as setTerminal,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { Transcript } from '@/features/transcript/transcript'
import { MobileLayout } from '@/features/workspace/mobile'
import {
  type Panel,
  PanelToggles,
  PanelView,
} from '@/features/workspace/panels'
import {
  defaultMachine,
  getState,
  machineOf,
  projectOf,
  showPalette,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { currentSearch, replaceSearch } from '@/lib/url'
import { cn, drag, mod } from '@/lib/utils'

const wide = window.matchMedia('(min-width: 768px)')
const compactWidth = 800

function subscribeWide(listener: () => void) {
  wide.addEventListener('change', listener)
  return () => wide.removeEventListener('change', listener)
}

export function App() {
  const desktop = useSyncExternalStore(subscribeWide, () => wide.matches)
  useHotkeys('mod+k', () => showPalette(!getState().paletteOpen), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  return (
    <div className="flex h-dvh text-sm">
      {desktop ? <DesktopLayout /> : <MobileLayout />}
      <Palette />
      {desktop ? <SettingsDialog /> : <MobileSettings />}
      <div
        className={cn(
          'fixed z-50 flex flex-col gap-2',
          desktop
            ? 'right-4 bottom-4 items-end'
            : 'inset-x-4 top-[calc(env(safe-area-inset-top)+0.5rem)] items-center'
        )}
      >
        <GitToast />
        <Toast />
      </div>
    </div>
  )
}

function setPanel(next: Panel | null) {
  replaceSearch({ panel: next ?? undefined })
}

function DesktopLayout() {
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
  const [sidebar, setSidebar] = useState(true)
  const column = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const panel = useSearch({
    from: '__root__',
    select: (search) => search.panel ?? null,
  })
  const lastPanel = useRef<Panel>('diff')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useLocalStorage('panelWidth', 540)
  const [terminalHeight, setTerminalHeight] = useState(280)
  const terminal = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().open
  )
  const running = useStore(selectedRunning)
  const git = useGitStatus(
    selection?.machine ?? '',
    machine?.status === 'online' ? (selection?.projectId ?? null) : null,
    running
  )
  const commands = useGitCommands({
    machine: selection?.machine ?? '',
    projectId: selection?.projectId ?? '',
    repos: git.repos,
    onRefresh: git.refresh,
  })
  const session = sessions.find(
    (item) =>
      item.machine === selection?.machine && item.id === selection.sessionId
  )

  const projectTitle = useProjectName(
    selection?.machine ?? '',
    selection?.projectId ?? ''
  )
  useHotkeys(
    ['meta+backquote', 'ctrl+backquote'],
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
  useHotkeys(
    'mod+j',
    (event) => {
      event.stopPropagation()
      setPanel(currentSearch().panel === undefined ? lastPanel.current : null)
    },
    {
      enableOnFormTags: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )
  useEffect(() => {
    if (panel !== null) {
      lastPanel.current = panel
    }
  }, [panel])
  useHotkeys('mod+b', () => setSidebar((open) => !open), {
    enableOnFormTags: true,
    preventDefault: true,
  })
  useEffect(() => {
    const element = column.current
    if (element === null) {
      throw new Error('chat column is not mounted')
    }
    const observer = new ResizeObserver((entries) =>
      setCompact(entries[0].contentRect.width < compactWidth)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const toggles =
    selection === null ? null : (
      <PanelToggles
        className="ml-auto flex shrink-0 items-center gap-1"
        selection={selection}
        panel={panel}
        terminal={terminal}
        changed={git.repos.some((repo) => repo.changed > 0)}
        onPanel={(next) => {
          setSelectedTask(null)
          setPanel(next)
        }}
        onTerminal={setTerminal}
      />
    )

  return (
    <>
      <Sidebar
        className={cn('relative', !sidebar && 'hidden')}
        mobile={false}
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
        <div
          ref={column}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden"
        >
          <header
            className={cn(
              'bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-3 pr-5 pl-[3.25rem]',
              sidebar && 'pl-5',
              panel === null && 'pr-3'
            )}
          >
            {selection !== null && machine !== null && (
              <nav className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-3 text-sm">
                  <li className="text-icon-muted flex shrink-0 items-center gap-1.5">
                    <HugeiconsIcon
                      icon={machineIcons[machine.icon]}
                      className="size-3.5 shrink-0"
                    />
                    <span className="max-w-40 truncate">{machine.name}</span>
                  </li>
                  <li aria-hidden className="text-icon-muted shrink-0">
                    /
                  </li>
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
            {machine !== null && machine.status !== 'online' && (
              <span className="text-warning-foreground shrink-0 text-xs">
                {machine.status === 'connecting' &&
                  `Connecting to ${machine.name}…`}
                {machine.status === 'offline' &&
                  `${machine.name} is offline, reconnecting…`}
                {machine.status === 'unpaired' &&
                  `${machine.name} needs pairing`}
              </span>
            )}
            {selection !== null && !compact && git.repos.length > 0 && (
              <GitActions
                machine={selection.machine}
                projectId={selection.projectId}
                repos={git.repos}
                onRefresh={git.refresh}
              />
            )}
            {selection !== null && compact && git.repos.length > 0 && (
              <DropdownMenu
                open={commands.menuOpen}
                onOpenChange={commands.setMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Git actions"
                    title="Git actions"
                  >
                    <HugeiconsIcon icon={MoreVerticalIcon} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <GitMenuItems git={commands} collapsed />
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {panel === null && toggles}
          </header>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {machine === null && <ConnectMachine />}
            {selection === null && machine !== null && (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <h1 className="text-foreground text-3xl font-normal tracking-tight">
                    Pick a thread, or start one
                  </h1>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Open a project from the sidebar to talk to Claude.
                  </p>
                </div>
              </div>
            )}
            {selection !== null && (
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
            className="bg-background relative flex shrink-0 flex-col border-l"
            style={{ width: panelWidth }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize select-none"
              onPointerDown={(event) =>
                drag(event, (next) => {
                  const max = Math.max(360, Math.floor(window.innerWidth * 0.7))
                  const value = Math.min(
                    max,
                    Math.max(360, window.innerWidth - next.clientX)
                  )
                  setPanelWidth(value)
                })
              }
            >
              <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
            </div>
            <PanelView
              panel={panel}
              selection={selection}
              cwd={cwd}
              running={running}
              selectedTask={selectedTask}
              onSelectTask={setSelectedTask}
              onPanel={setPanel}
              toggles={toggles}
            />
          </div>
        )}
      </main>
      <GitCommandDialog git={commands} />
    </>
  )
}
