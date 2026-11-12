import { NO_PROJECT } from '@offsite/core/projects'
import { useSearch } from '@tanstack/react-router'
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocalStorage } from 'usehooks-ts'
import { machineKey } from '@/api/machines'
import { useProjectName } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { Composer } from '@/features/composer/composer'
import { UsageLimitBadge } from '@/features/composer/usage-limit-badge'
import {
  GitActions,
  GitCommandDialog,
  GitMenuItems,
  useGitCommands,
  useGitStatus,
} from '@/features/git/git-menu'
import { ConnectMachine } from '@/features/sidebar/connect-machine'
import { Sidebar } from '@/features/sidebar/sidebar'
import { TerminalPanel } from '@/features/terminal/panel'
import {
  getState as terminalState,
  setOpen as setTerminal,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { TerminalPage } from '@/features/terminal/terminal-page'
import { Transcript } from '@/features/transcript/transcript'
import { PanelView } from '@/features/workspace/panel-view'
import {
  type Panel,
  PanelMenu,
  PanelToggles,
} from '@/features/workspace/panels'
import {
  defaultMachine,
  machineOf,
  projectOf,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { currentSearch, replaceSearch, useTerminalPage } from '@/lib/url'
import { cn, drag } from '@/lib/utils'

const compactWidth = 800

function setPanel(next: Panel | null) {
  replaceSearch({ panel: next ?? undefined })
}

export function DesktopLayout() {
  const selection = useStore((state) => state.selection)
  const sessions = useStore((state) => state.sessions)
  const page = useTerminalPage()
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
  const header = useRef<HTMLElement>(null)
  const [compact, setCompact] = useState(false)
  const panel = useSearch({
    from: '__root__',
    select: (search) => search.panel ?? null,
  })
  const lastPanel = useRef<Panel>('diff')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const openTask = useCallback((id: string) => {
    setSelectedTask(id)
    setPanel('tasks')
  }, [])
  const [panelWidth, setPanelWidth] = useLocalStorage('panelWidth', 540)
  const [terminalHeight, setTerminalHeight] = useState(280)
  const terminal = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().open
  )
  const running = useStore(selectedRunning)
  const projectless = useStore(
    (state) =>
      state.selection?.projectId === NO_PROJECT ||
      (state.selection !== null &&
        projectOf(state, state.selection.machine, state.selection.projectId)
          ?.scratch === true)
  )
  const git = useGitStatus(
    selection?.machine ?? '',
    machine?.status === 'online' && !projectless
      ? (selection?.projectId ?? null)
      : null,
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
  const generatingTitle = useStore(
    (state) =>
      session !== undefined &&
      state.generatingTitles.includes(machineKey(session.machine, session.id))
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
      enableOnContentEditable: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )
  useHotkeys(
    ['mod+b', 'mod+shift+b'],
    (event) => {
      event.stopPropagation()
      setPanel(currentSearch().panel === undefined ? lastPanel.current : null)
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )
  useEffect(() => {
    if (panel !== null) {
      lastPanel.current = panel
    }
  }, [panel])
  useEffect(() => {
    if (page !== null) {
      return
    }
    const element = header.current
    if (element === null) {
      throw new Error('header is not mounted')
    }
    const observer = new ResizeObserver((entries) =>
      setCompact(entries[0].contentRect.width < compactWidth)
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [page])

  if (page !== null) {
    return (
      <>
        <Sidebar className="relative" mobile={false} />
        <TerminalPage machine={page} mobile={false} />
      </>
    )
  }

  return (
    <>
      <Sidebar className="relative" mobile={false} />
      <main className="bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          ref={header}
          className="bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-3 pr-3 pl-5"
        >
          {selection !== null && machine !== null && (
            <nav className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-3 text-sm">
                <li className="text-icon-muted flex shrink-0 items-center gap-1.5">
                  <MachineLogo
                    icon={machine.icon}
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
                <li className="text-foreground flex min-w-10 flex-1 items-center gap-2 font-medium">
                  <span
                    className={cn(
                      'truncate',
                      (generatingTitle ||
                        (selection.sessionId !== null &&
                          session === undefined)) &&
                        'text-shimmer'
                    )}
                  >
                    {session?.title ?? 'New thread'}
                  </span>
                  <UsageLimitBadge />
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
              {machine.status === 'unpaired' && `${machine.name} needs pairing`}
            </span>
          )}
          {selection !== null && !projectless && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {!compact && git.repos.length > 0 && (
                <GitActions
                  machine={selection.machine}
                  projectId={selection.projectId}
                  repos={git.repos}
                  onRefresh={git.refresh}
                />
              )}
              {!compact && git.repos.length > 0 && (
                <span className="bg-foreground/15 mr-1 ml-2.5 h-4 w-px" />
              )}
              <PanelToggles
                selection={selection}
                panel={panel}
                terminal={terminal}
                repos={git.repos}
                onPanel={(next) => {
                  setSelectedTask(null)
                  setPanel(next)
                }}
                onTerminal={setTerminal}
              >
                <PanelMenu
                  selection={selection}
                  mobile={false}
                  session={session}
                  panel={panel}
                  terminal={terminal}
                  repos={git.repos}
                  open={commands.menuOpen}
                  onOpenChange={commands.setMenuOpen}
                  onPanel={(next) => {
                    setSelectedTask(null)
                    setPanel(next)
                  }}
                  onTerminal={setTerminal}
                >
                  {compact && git.repos.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <GitMenuItems git={commands} collapsed />
                    </>
                  )}
                </PanelMenu>
              </PanelToggles>
            </div>
          )}
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
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
                  <Transcript onOpenTask={openTask} />
                  <Composer repos={git.repos} onRefreshGit={git.refresh} />
                </Fragment>
              )}
            </div>
            {selection !== null && terminal && !projectless && (
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
                <TerminalPanel view={selection.projectId} />
              </aside>
            )}
          </div>
          {selection !== null && panel !== null && !projectless && (
            <div
              className="relative flex shrink-0"
              style={{ width: panelWidth }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize select-none"
                onPointerDown={(event) =>
                  drag(event, (next) => {
                    const max = Math.max(
                      360,
                      Math.floor(window.innerWidth * 0.7)
                    )
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
              <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-lg border-t border-l">
                <PanelView
                  panel={panel}
                  selection={selection}
                  running={running}
                  selectedTask={selectedTask}
                  onSelectTask={setSelectedTask}
                  onPanel={setPanel}
                  mobile={false}
                />
              </div>
            </div>
          )}
        </div>
      </main>
      <GitCommandDialog git={commands} />
    </>
  )
}
