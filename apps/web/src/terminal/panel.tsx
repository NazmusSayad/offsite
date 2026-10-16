import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Layers01Icon,
  MinusSignIcon,
  Notification01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { TerminalTab } from '@server/protocol'
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Progress } from '@/ghostty/terminal'
import { cn } from '@/lib/utils'
import { toggleQuiet } from './attention'
import { closeTab } from './close-tab'
import { CloseDialog, RenameDialog } from './dialogs'
import { FindBar } from './find-bar'
import {
  getState,
  mount,
  send,
  sendInput,
  subscribe,
  tabTitle,
  toggleCtrl,
} from './session'
import { useTerminalShortcuts } from './shortcuts'

const keys = [
  { label: 'Esc', sequence: '\x1b' },
  { label: 'Tab', sequence: '\t' },
  { label: '↑', sequence: '\x1b[A' },
  { label: '↓', sequence: '\x1b[B' },
  { label: '←', sequence: '\x1b[D' },
  { label: '→', sequence: '\x1b[C' },
]

export function TerminalPanel(props: { cwd: string }) {
  const state = useSyncExternalStore(subscribe, getState)
  const [renaming, setRenaming] = useState<{
    id: number
    name: string
  } | null>(null)
  const active = state.status === 'active'
  const project = state.layout[props.cwd]
  const tabId = project?.activeTab ?? null
  const visibleTabs = project?.tabs.filter((tab) => !tab.minimized) ?? []
  const minimizedTabs = project?.tabs.filter((tab) => tab.minimized) ?? []
  const shortcuts = useTerminalShortcuts()

  useEffect(() => {
    if (active) send({ type: 'select', cwd: props.cwd, tabId: null })
  }, [props.cwd, active])

  if (!state.loaded)
    return (
      <div className="text-muted-foreground grid h-full place-items-center p-4 text-xs whitespace-pre-wrap">
        {state.failure === null
          ? 'Starting the terminal…'
          : `The terminal could not start: ${state.failure}`}
      </div>
    )

  return (
    <div ref={shortcuts} className="flex h-full flex-col text-sm">
      <header
        className={cn(
          'flex h-8 flex-none select-none',
          visibleTabs.length === 1 ? 'bg-background' : 'bg-sidebar'
        )}
      >
        {minimizedTabs.length > 0 && (
          <MinimizedTabs
            cwd={props.cwd}
            tabs={minimizedTabs}
            alerts={state.alerts}
            bordered={visibleTabs.length > 1}
          />
        )}
        <div className="flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto">
          {visibleTabs.map((tab) => (
            <TabMenu
              key={tab.id}
              tabId={tab.id}
              onMinimize={
                visibleTabs.length > 1
                  ? () => send({ type: 'minimizeTab', id: tab.id })
                  : undefined
              }
              onRename={() =>
                setRenaming({ id: tab.id, name: tab.customName ?? '' })
              }
            >
              <div
                className={cn(
                  'group/tab text-muted-foreground hover:text-foreground relative flex min-w-28 flex-1 items-center justify-center border-r border-b px-7 text-xs transition-colors last:border-r-0',
                  tab.id === tabId &&
                    'bg-background text-foreground border-b-transparent'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  send({ type: 'select', cwd: props.cwd, tabId: tab.id })
                }
              >
                <span className="truncate">{tabTitle(tab)}</span>
                <AttentionDot
                  ids={[tab.id]}
                  className="ml-1.5 size-1.5 flex-none rounded-full"
                />
                <TabProgress progress={state.progress[tab.id]} />
                <button
                  className={cn(
                    'text-muted-foreground hover:bg-accent hover:text-foreground absolute left-1.5 grid size-4.5 place-items-center rounded opacity-0 transition-opacity group-hover/tab:opacity-100',
                    tab.id === tabId && 'pointer-coarse:opacity-100'
                  )}
                  aria-label="Close tab"
                  onClick={(event) => {
                    event.stopPropagation()
                    void closeTab(tab.id)
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </div>
            </TabMenu>
          ))}
        </div>
        <button
          className={cn(
            'text-muted-foreground hover:text-foreground grid w-8 flex-none place-items-center transition-colors',
            visibleTabs.length > 1 && 'border-b border-l'
          )}
          aria-label="New tab"
          title="New tab"
          onClick={() => send({ type: 'createTab', cwd: props.cwd })}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        {tabId !== null && (
          <TerminalPane key={`${state.instance}-${tabId}`} id={tabId} />
        )}
        {tabId !== null && state.finding === tabId && (
          <FindBar key={tabId} id={tabId} />
        )}
        {!active && (
          <div className="bg-background/80 animate-in fade-in absolute inset-0 z-20 grid place-items-center p-6 text-center backdrop-blur-md duration-200">
            <div className="flex flex-col items-center gap-3">
              <span className="border-foreground/15 border-t-foreground/70 size-6 animate-spin rounded-full border-[3px]" />
              <p className="text-muted-foreground text-xs">
                Connecting. Your terminals keep running while you wait.
              </p>
            </div>
          </div>
        )}
      </div>
      {tabId !== null && (
        <div className="bg-card hidden flex-none gap-1.5 overflow-x-auto border-t p-1.5 pointer-coarse:flex">
          {keys.map((key) => (
            <Button
              key={key.label}
              variant="secondary"
              className="min-w-11"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => sendInput(tabId, key.sequence)}
            >
              {key.label}
            </Button>
          ))}
          <Button
            variant={state.ctrl ? 'default' : 'secondary'}
            className="min-w-11"
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggleCtrl}
          >
            Ctrl
          </Button>
        </div>
      )}
      {renaming !== null && (
        <RenameDialog
          key={renaming.id}
          id={renaming.id}
          name={renaming.name}
          onDone={() => setRenaming(null)}
        />
      )}
      <CloseDialog />
    </div>
  )
}

function TerminalPane(props: { id: number }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) throw new Error('terminal container missing')
    return mount(props.id, container.current)
  }, [props.id])

  return (
    <div
      className="bg-background absolute inset-0 pt-(--pad-top) pr-(--pad-right) pb-(--pad-bottom) pl-(--pad-left)"
      ref={container}
    />
  )
}

function TabMenu(props: {
  tabId: number
  onRename: () => void
  onMinimize: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onRename}>
          <HugeiconsIcon icon={PencilEdit02Icon} />
          Rename
        </ContextMenuItem>
        {props.onMinimize && (
          <ContextMenuItem onSelect={props.onMinimize}>
            <HugeiconsIcon icon={MinusSignIcon} />
            Minimize
          </ContextMenuItem>
        )}
        <ContextMenuCheckboxItem
          checked={getState().quiet.includes(props.tabId)}
          onCheckedChange={() => toggleQuiet(props.tabId)}
        >
          <HugeiconsIcon icon={Notification01Icon} />
          Notify when quiet for 10s
        </ContextMenuCheckboxItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => void closeTab(props.tabId)}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          Close tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function MinimizedTabs(props: {
  cwd: string
  tabs: TerminalTab[]
  alerts: number[]
  bordered: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'text-muted-foreground hover:text-foreground flex flex-none items-center gap-1 px-2.5 transition-colors',
            props.bordered && 'border-r border-b'
          )}
          aria-label="Minimized tabs"
          title="Minimized tabs"
        >
          <HugeiconsIcon icon={Layers01Icon} className="size-4" />
          <CountBadge
            count={props.tabs.length}
            alert={props.tabs.some((tab) => props.alerts.includes(tab.id))}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.tabs.map((tab) => (
          <DropdownMenuItem
            key={tab.id}
            onSelect={() =>
              send({ type: 'select', cwd: props.cwd, tabId: tab.id })
            }
          >
            <span className="max-w-80 truncate">{tabTitle(tab)}</span>
            <AttentionDot
              ids={[tab.id]}
              className="size-1.5 flex-none rounded-full"
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AttentionDot(props: { ids: number[]; className: string }) {
  const alerts = getState().alerts
  if (!props.ids.some((id) => alerts.includes(id))) return null
  return <span className={cn('bg-primary', props.className)} />
}

function CountBadge(props: { count: number; alert: boolean }) {
  return (
    <span
      className={cn(
        'grid h-3.5 min-w-3.5 place-items-center rounded-full px-1 text-[9px] leading-none font-medium tabular-nums',
        props.alert
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground bg-[color-mix(in_srgb,var(--text)_22%,var(--bg))]'
      )}
    >
      {props.count}
    </span>
  )
}

function TabProgress(props: { progress: Progress | undefined }) {
  const progress = props.progress
  if (!progress || progress.state === 0) return null
  if (progress.state === 3)
    return (
      <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 animate-pulse" />
    )
  return (
    <span
      className={cn(
        'absolute bottom-0 left-0 h-0.5 transition-[width]',
        progress.state === 1 && 'bg-primary',
        progress.state === 2 && 'bg-destructive',
        progress.state === 4 && 'bg-yellow-500'
      )}
      style={{
        width: `${progress.state !== 1 && progress.value === 0 ? 100 : progress.value}%`,
      }}
    />
  )
}
