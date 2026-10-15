import {
  AlertCircleIcon,
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment, useState, useSyncExternalStore } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { AccountsDialog } from '@/accounts/accounts-dialog'
import { ProjectIcon } from '@/components/icons'
import { Toast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Composer } from '@/composer/composer'
import { DiffPanel } from '@/git/diff-panel'
import { GitActions, useGitStatus } from '@/git/git-menu'
import { projectName } from '@/lib/format'
import { cn, drag, mod } from '@/lib/utils'
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
  const [panel, setPanel] = useState(false)
  const [panelWidth, setPanelWidth] = useState(540)
  const terminal = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().open
  )
  const terminalAlert = useSyncExternalStore(
    subscribeTerminal,
    () => terminalState().alerts.length > 0
  )
  const running = useStore(selectedRunning)
  const git = useGitStatus(selection?.cwd ?? null, running)
  const session = sessions.find((item) => item.id === selection?.sessionId)

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
              !panel && 'pr-24 sm:pr-24'
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
                    <span className="max-w-40 truncate">
                      {projectName(selection.cwd)}
                    </span>
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
                <Transcript onOpenDiff={() => setPanel(true)} />
                <Composer branch={git.status?.branch ?? null} />
              </Fragment>
            )}
          </div>
          {selection !== null && terminal && (
            <aside className="border-border/80 bg-background h-70 shrink-0 overflow-hidden border-t">
              <TerminalPanel cwd={selection.cwd} />
            </aside>
          )}
        </div>
        {selection !== null && panel && (
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
                  setPanelWidth(
                    Math.min(
                      max,
                      Math.max(360, window.innerWidth - next.clientX)
                    )
                  )
                })
              }
            >
              <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
            </div>
            <DiffPanel
              cwd={selection.cwd}
              running={running}
              onClose={() => setPanel(false)}
            />
          </div>
        )}
      </main>
      {selection !== null && (
        <div className="fixed top-0 right-3 z-50 flex h-(--workspace-topbar-height) items-center gap-1">
          <button
            className={cn(toggle, 'relative')}
            data-pressed={terminal}
            aria-label="Toggle terminal"
            title={`Terminal (${mod}+J)`}
            onClick={() => setTerminal(!terminal)}
          >
            <HugeiconsIcon icon={PanelBottomIcon} />
            {terminalAlert && (
              <span className="bg-primary absolute top-1 right-1 size-1.5 rounded-full" />
            )}
          </button>
          <button
            className={toggle}
            data-pressed={panel}
            aria-label="Toggle diff panel"
            title="Diff"
            onClick={() => setPanel(!panel)}
          >
            <HugeiconsIcon icon={PanelRightIcon} />
          </button>
        </div>
      )}
      <AccountsDialog />
      <Palette />
      <SettingsDialog />
      <Toast />
    </div>
  )
}
