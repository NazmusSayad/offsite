import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Folder01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS, type TerminalTab } from '@offsite/core/terminal'
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
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { Progress } from '@/lib/ghostty/terminal'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
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
  terminalMachine,
  toggleCtrl,
  viewTabs,
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

export function TerminalPanel(props: {
  view: string
  tabSize?: 'default' | 'lg'
}) {
  const state = useSyncExternalStore(subscribe, getState)
  const active = state.status === 'active'
  const tabs = viewTabs(state.layout, props.view)
  const tabId = state.layout.active[props.view] ?? null
  const shortcuts = useTerminalShortcuts()

  useEffect(() => {
    if (active) {
      send({ type: 'select', view: props.view, tabId: null })
    }
  }, [props.view, active])

  function create() {
    send({
      type: 'createTab',
      projectId: props.view === GLOBAL_TERMINALS ? null : props.view,
    })
  }

  if (!state.loaded) {
    return (
      <div className="text-muted-foreground grid h-full place-items-center p-4 text-xs whitespace-pre-wrap">
        {state.failure === null
          ? 'Starting the terminal…'
          : `The terminal could not start: ${state.failure}`}
      </div>
    )
  }

  return (
    <div ref={shortcuts} className="flex h-full flex-col text-sm">
      <header
        className={cn(
          'flex h-9 flex-none select-none',
          props.tabSize === 'lg' && 'h-(--workspace-topbar-height)',
          tabs.length === 1 ? 'bg-background' : 'bg-sidebar'
        )}
      >
        <div className="flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto">
          {tabs.map((tab) => (
            <TabMenu key={tab.id} tab={tab}>
              <div
                className={cn(
                  'group/tab text-muted-foreground hover:text-foreground relative flex min-w-28 flex-1 items-center justify-center border-r border-b px-7 text-xs transition-colors last:border-r-0',
                  props.tabSize === 'lg' && 'text-[13px]',
                  tab.id === tabId &&
                    'bg-background text-foreground border-b-transparent'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  send({
                    type: 'select',
                    view: props.view,
                    tabId: tab.id,
                  })
                }
              >
                <span className="truncate">{tabTitle(tab)}</span>
                <AttentionDot
                  id={tab.id}
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
            tabs.length > 1 && 'border-b border-l'
          )}
          aria-label="New tab"
          title="New tab"
          onClick={create}
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
        {active && tabId === null && (
          <button
            className="text-muted-foreground hover:text-foreground grid size-full cursor-pointer place-items-center text-xs transition-colors"
            onClick={create}
          >
            New terminal
          </button>
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
      <CloseDialog />
    </div>
  )
}

function TerminalPane(props: { id: number }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!container.current) {
      throw new Error('terminal container missing')
    }
    return mount(props.id, container.current)
  }, [props.id])

  return (
    <div
      className="bg-background absolute inset-0 pt-(--pad-top) pr-(--pad-right) pb-(--pad-bottom) pl-(--pad-left)"
      ref={container}
    />
  )
}

function TabMenu(props: { tab: TerminalTab; children: ReactNode }) {
  const [renaming, setRenaming] = useState(false)
  const allProjects = useStore((state) => state.projects)
  const projects = allProjects.filter(
    (project) => project.machine === terminalMachine()
  )
  const tab = props.tab

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setRenaming(true)}>
            <HugeiconsIcon icon={PencilEdit02Icon} />
            Rename
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <HugeiconsIcon icon={Folder01Icon} />
              Move to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="max-h-80 overflow-y-auto">
              <ContextMenuRadioGroup
                value={tab.projectId ?? ''}
                onValueChange={(value) =>
                  send({
                    type: 'assignTab',
                    id: tab.id,
                    projectId: value === '' ? null : value,
                  })
                }
              >
                <ContextMenuRadioItem value="">No project</ContextMenuRadioItem>
                {projects.length > 0 && <ContextMenuSeparator />}
                {projects.map((project) => (
                  <ContextMenuRadioItem key={project.id} value={project.id}>
                    <span className="max-w-60 truncate">{project.name}</span>
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void closeTab(tab.id)}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            Close tab
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {renaming && (
        <RenameDialog
          id={tab.id}
          name={tab.customName ?? ''}
          onDone={() => setRenaming(false)}
        />
      )}
    </>
  )
}

function AttentionDot(props: { id: number; className: string }) {
  if (!getState().alerts.includes(props.id)) {
    return null
  }
  return <span className={cn('bg-primary', props.className)} />
}

function TabProgress(props: { progress: Progress | undefined }) {
  const progress = props.progress
  if (!progress || progress.state === 0) {
    return null
  }
  if (progress.state === 3) {
    return (
      <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 animate-pulse" />
    )
  }
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
