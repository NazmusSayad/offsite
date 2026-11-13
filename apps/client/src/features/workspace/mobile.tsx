import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { NO_PROJECT } from '@offsite/core/projects'
import { useSearch } from '@tanstack/react-router'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Fragment, useCallback, useState, useSyncExternalStore } from 'react'
import { machineKey } from '@/api/machines'
import { useProjectName, useWorktreeBranch } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { ActivityPage } from '@/features/activity/activity-page'
import { Composer } from '@/features/composer/composer'
import { UsageLimitBadge } from '@/features/composer/usage-limit-badge'
import {
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
  requestTab,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { TerminalPage } from '@/features/terminal/terminal-page'
import { Transcript } from '@/features/transcript/transcript'
import { PanelView } from '@/features/workspace/panel-view'
import { type Panel, PanelMenu } from '@/features/workspace/panels'
import { pendingTitle } from '@/lib/outbox'
import { router, type Search } from '@/lib/router'
import { closeSession } from '@/lib/sessions'
import {
  machineOf,
  projectOf,
  type Selection,
  selectedRunning,
  useStore,
} from '@/lib/store'
import {
  pushSearch,
  replaceSearch,
  useActivityPage,
  useTerminalPage,
} from '@/lib/url'
import { cn } from '@/lib/utils'

export function MobileLayout() {
  const selection = useStore((state) => state.selection)
  const hasMachine = useStore((state) => state.machines.length > 0)
  const page = useTerminalPage()
  const activity = useActivityPage()

  if (!hasMachine && page === null && selection === null && !activity) {
    return (
      <main className="bg-background flex flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <ConnectMachine />
      </main>
    )
  }
  return (
    <div className="relative flex min-w-0 flex-1">
      <div
        inert={page !== null || selection !== null || activity}
        className="bg-sidebar flex min-w-0 flex-1 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <Sidebar className="min-w-0 flex-1 border-r-0" mobile />
      </div>
      {page !== null && (
        <div className="absolute inset-0 flex">
          <TerminalPage
            machine={page}
            mobile
            leading={
              <Button
                variant="ghost"
                size="icon"
                className="ml-2"
                aria-label="Back"
                title="Back"
                onClick={() =>
                  void router.navigate({ to: '/', search: {}, replace: true })
                }
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  className="text-foreground size-5"
                  strokeWidth={2}
                />
              </Button>
            }
          />
        </div>
      )}
      {activity && (
        <div className="absolute inset-0 flex">
          <ActivityPage
            mobile
            leading={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back"
                title="Back"
                onClick={() =>
                  void router.navigate({ to: '/', search: {}, replace: true })
                }
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  className="text-foreground size-5"
                  strokeWidth={2}
                />
              </Button>
            }
          />
        </div>
      )}
      {page === null && selection !== null && (
        <div className="absolute inset-0 flex">
          <MobileChat selection={selection} />
        </div>
      )}
    </div>
  )
}

function MobileChat(props: { selection: Selection }) {
  const machine = useStore((state) => machineOf(state, props.selection.machine))
  const view = useStore((state) => state.view)
  const session = useStore((state) =>
    state.sessions.find(
      (item) =>
        item.machine === props.selection.machine &&
        item.id === props.selection.sessionId
    )
  )
  const pending = useStore(pendingTitle)
  const generatingTitle = useStore(
    (state) =>
      session !== undefined &&
      state.generatingTitles.includes(machineKey(session.machine, session.id))
  )
  const projectTitle = useProjectName(
    props.selection.machine,
    props.selection.projectId
  )
  const branch = useWorktreeBranch(
    props.selection.machine,
    props.selection.projectId
  )
  const running = useStore(selectedRunning)
  const projectless = useStore(
    (state) =>
      props.selection.projectId === NO_PROJECT ||
      projectOf(state, props.selection.machine, props.selection.projectId)
        ?.scratch === true
  )
  const git = useGitStatus(
    props.selection.machine,
    machine.status === 'online' && !projectless
      ? props.selection.projectId
      : null,
    running
  )
  const commands = useGitCommands({
    machine: props.selection.machine,
    projectId: props.selection.projectId,
    repos: git.repos,
    onRefresh: git.refresh,
  })
  const terminal = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().open
  )
  const panel = useSearch({
    from: '__root__',
    select: (search) =>
      search.panel === 'pull' && search.pull === undefined
        ? null
        : (search.panel ?? null),
  })
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const open =
    panel === 'pull' || (!projectless && (panel !== null || terminal))

  const showOverlay = useCallback(
    (search: Search) => {
      if (open) {
        replaceSearch(search)
        return
      }
      pushSearch(search, 'overlay')
    },
    [open]
  )

  const showPanel = useCallback(
    (next: Panel | null) => {
      setSelectedTask(null)
      if (next === null) {
        replaceSearch({ panel: undefined, bottom: undefined, pull: undefined })
        return
      }
      showOverlay({ panel: next, bottom: undefined, pull: undefined })
    },
    [showOverlay]
  )

  const openTask = useCallback(
    (id: string) => {
      showPanel('tasks')
      setSelectedTask(id)
    },
    [showPanel]
  )

  function showTerminal(next: boolean) {
    if (!next) {
      replaceSearch({ panel: undefined, bottom: undefined })
      return
    }
    requestTab()
    showOverlay({ panel: undefined, bottom: 'terminal' })
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1.5 px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={closeSession}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            className="text-foreground size-5"
            strokeWidth={2}
          />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate font-medium">
            <span
              className={cn(
                (generatingTitle ||
                  (props.selection.sessionId !== null &&
                    session === undefined)) &&
                  'text-shimmer'
              )}
            >
              {session?.title ?? pending ?? 'New thread'}
            </span>
          </div>
          {machine.status === 'online' && (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <MachineLogo icon={machine.icon} className="size-3.5 shrink-0" />
              <span className="truncate">
                {machine.name} / {projectTitle}
                {branch !== null && ` · ${branch}`}
              </span>
            </div>
          )}
          {machine.status !== 'online' && (
            <div className="text-warning-foreground truncate text-xs">
              {machine.status === 'connecting' &&
                `Connecting to ${machine.name}…`}
              {machine.status === 'offline' &&
                `${machine.name} is offline, reconnecting…`}
              {machine.status === 'unpaired' && `${machine.name} needs pairing`}
            </div>
          )}
        </div>
        <UsageLimitBadge />
        {!projectless && (
          <PanelMenu
            selection={props.selection}
            mobile
            session={session}
            panel={panel}
            terminal={terminal}
            repos={git.repos}
            open={commands.menuOpen}
            onOpenChange={commands.setMenuOpen}
            onPanel={showPanel}
            onTerminal={showTerminal}
          >
            {git.repos.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <GitMenuItems git={commands} collapsed />
              </>
            )}
          </PanelMenu>
        )}
        <GitCommandDialog git={commands} />
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Fragment key={view}>
          <Transcript onOpenTask={openTask} />
          <Composer repos={git.repos} onRefreshGit={git.refresh} />
        </Fragment>
      </div>
      <DialogPrimitive.Root open={open} onOpenChange={() => showPanel(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="bg-background data-open:animate-in data-open:slide-in-from-right fixed inset-0 z-40 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sm duration-200 outline-none motion-reduce:animate-none"
          >
            <DialogPrimitive.Title className="sr-only">
              {panel === 'diff' && 'Diff'}
              {panel === 'pulls' && 'Pull requests'}
              {panel === 'pull' && 'Pull request'}
              {panel === 'tasks' && 'Tasks'}
              {panel === 'browser' && 'Browser'}
              {panel === null && 'Terminal'}
            </DialogPrimitive.Title>
            <div className="flex min-h-0 flex-1 flex-col">
              {panel !== null && (
                <PanelView
                  panel={panel}
                  selection={props.selection}
                  running={running}
                  selectedTask={selectedTask}
                  onSelectTask={setSelectedTask}
                  onPanel={showPanel}
                  mobile
                />
              )}
              {panel === null && terminal && (
                <div className="min-h-0 flex-1">
                  <TerminalPanel
                    view={props.selection.projectId}
                    mobile
                    leading={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2"
                        title="Back"
                        aria-label="Back"
                        onClick={() => showTerminal(false)}
                      >
                        <HugeiconsIcon
                          icon={ArrowLeft01Icon}
                          className="text-foreground size-5"
                          strokeWidth={2}
                        />
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </main>
  )
}
