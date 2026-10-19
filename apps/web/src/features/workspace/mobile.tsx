import { ArrowLeft01Icon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react'
import { useProjectName } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Composer } from '@/features/composer/composer'
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
  setOpen as setTerminal,
  subscribe as subscribeTerminal,
} from '@/features/terminal/session'
import { Transcript } from '@/features/transcript/transcript'
import {
  ErrorBanner,
  type Panel,
  PanelMenu,
  PanelView,
} from '@/features/workspace/panels'
import { closeSession, openSession } from '@/lib/sessions'
import {
  getState,
  machineOf,
  projectOf,
  type Selection,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { selectionFromUrl } from '@/lib/url'

export function MobileLayout() {
  const selection = useStore((state) => state.selection)
  const hasMachine = useStore((state) => state.machines.length > 0)
  const open = selection !== null

  useEffect(() => {
    if (open && history.state !== 'chat') {
      history.pushState('chat', '', location.href)
    }
    if (!open && history.state === 'chat') {
      history.back()
    }
    if (!open) {
      setTerminal(false)
    }
  }, [open])

  useEffect(() => {
    function navigate() {
      if (history.state !== 'chat') {
        closeSession()
        return
      }
      const next = selectionFromUrl(
        getState().machines.map((machine) => machine.id)
      )
      if (next === null) {
        history.back()
        return
      }
      openSession(next)
    }
    addEventListener('popstate', navigate)
    return () => removeEventListener('popstate', navigate)
  }, [])

  if (selection !== null) {
    return <MobileChat selection={selection} />
  }
  if (!hasMachine) {
    return (
      <main className="bg-background flex flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <ConnectMachine />
      </main>
    )
  }
  return (
    <div className="bg-sidebar relative flex min-w-0 flex-1 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Sidebar className="min-w-0 flex-1 border-r-0" mobile />
      <ErrorBanner />
    </div>
  )
}

function MobileChat(props: { selection: Selection }) {
  const machine = useStore((state) => machineOf(state, props.selection.machine))
  const session = useStore((state) =>
    state.sessions.find(
      (item) =>
        item.machine === props.selection.machine &&
        item.id === props.selection.sessionId
    )
  )
  const cwd = useStore(
    (state) =>
      projectOf(state, props.selection.machine, props.selection.projectId)
        ?.path ?? ''
  )
  const projectTitle = useProjectName(
    props.selection.machine,
    props.selection.projectId
  )
  const running = useStore(selectedRunning)
  const git = useGitStatus(
    props.selection.machine,
    machine.status === 'online' ? props.selection.projectId : null,
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
  const [panel, setPanel] = useState<Panel | null>(null)
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const changed = git.repos.some((repo) => repo.changed > 0)

  function showPanel(next: Panel | null) {
    setSelectedTask(null)
    setPanel(next)
    setTerminal(false)
  }

  function showTerminal(next: boolean) {
    setPanel(null)
    setTerminal(next)
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1.5 px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back"
          onClick={() => history.back()}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            className="text-foreground size-5"
            strokeWidth={2}
          />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate font-medium">
            {session?.title ?? 'New thread'}
          </div>
          {machine.status === 'online' && (
            <div className="text-muted-foreground truncate text-xs">
              {machine.name} / {projectTitle}
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
        <PanelMenu
          className="flex shrink-0 items-center gap-1"
          selection={props.selection}
          panel={panel}
          terminal={terminal}
          changed={changed}
          open={commands.menuOpen}
          onOpenChange={commands.setMenuOpen}
          onPanel={showPanel}
          onTerminal={showTerminal}
        >
          {git.repos.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <GitMenuItems git={commands} commit />
            </>
          )}
        </PanelMenu>
        <GitCommandDialog git={commands} />
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <ErrorBanner />
        <Fragment
          key={`${props.selection.machine} ${props.selection.sessionId ?? props.selection.projectId}`}
        >
          <Transcript
            onOpenDiff={() => showPanel('diff')}
            onOpenTask={(id) => {
              showPanel('tasks')
              setSelectedTask(id)
            }}
          />
          <Composer />
        </Fragment>
      </div>
      <DialogPrimitive.Root
        open={panel !== null || terminal}
        onOpenChange={() => showPanel(null)}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="bg-background data-open:animate-in data-open:slide-in-from-right fixed inset-0 z-40 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sm duration-200 outline-none [--panel-header-end:0.75rem] [--workspace-topbar-height:44px] motion-reduce:animate-none"
          >
            <DialogPrimitive.Title className="sr-only">
              {panel === 'diff' && 'Diff'}
              {panel === 'tasks' && 'Tasks'}
              {panel === 'files' && 'Files'}
              {panel === null && 'Terminal'}
            </DialogPrimitive.Title>
            <div className="flex min-h-0 flex-1 flex-col">
              {panel !== null && (
                <PanelView
                  panel={panel}
                  selection={props.selection}
                  cwd={cwd}
                  running={running}
                  selectedTask={selectedTask}
                  onSelectTask={setSelectedTask}
                  onPanel={showPanel}
                />
              )}
              {panel === null && terminal && (
                <>
                  <div className="border-border/60 flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b px-3">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Close"
                      aria-label="Close"
                      onClick={() => showTerminal(false)}
                    >
                      <HugeiconsIcon icon={XIcon} className="size-3.5" />
                    </Button>
                    <span className="text-foreground min-w-0 truncate text-xs font-medium">
                      Terminal
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    <TerminalPanel projectId={props.selection.projectId} />
                  </div>
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </main>
  )
}
