import {
  Add01Icon,
  Cancel01Icon,
  FullScreenIcon,
  GitBranchIcon,
  Menu01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
import { FindBar } from '@/find-bar'
import type { Progress } from '@/ghostty/terminal'
import { ItemMenu } from '@/item-menu'
import { cn } from '@/lib/utils'
import { CountBadge, MinimizedTabs } from '@/minimized-tabs'
import { FolderDialog, RenameDialog } from '@/prompt-dialogs'
import {
  getState,
  mount,
  removeLogo,
  send,
  sendInput,
  subscribe,
  tabTitle,
  toggleCtrl,
  uploadLogo,
} from '@/session'
import { toggleFullscreen } from '@/shortcuts'
import { StatusOverlay } from '@/status-overlay'

type Prompt = {
  type: 'rename' | 'close' | 'folder'
  target: 'tab' | 'group'
  id: number
  name: string
}

const keys = [
  { label: 'Esc', sequence: '\x1b' },
  { label: 'Tab', sequence: '\t' },
  { label: '↑', sequence: '\x1b[A' },
  { label: '↓', sequence: '\x1b[B' },
  { label: '←', sequence: '\x1b[D' },
  { label: '→', sequence: '\x1b[C' },
]

export function App() {
  const state = useSyncExternalStore(subscribe, getState)
  const [drawer, setDrawer] = useState(false)
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const logoGroup = useRef<number | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  function showError(error: unknown) {
    setLogoError(error instanceof Error ? error.message : String(error))
  }
  const layout = state.layout
  const group = layout.groups.find((item) => item.id === layout.activeGroup)
  const tabId = group?.activeTab ?? null
  const visibleTabs = group?.tabs.filter((tab) => !tab.minimized) ?? []
  const minimizedTabs = group?.tabs.filter((tab) => tab.minimized) ?? []

  return (
    <div className="flex h-dvh text-sm">
      {drawer && (
        <div
          className="fixed inset-0 z-10 bg-black/50 md:hidden"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 flex w-60 -translate-x-full flex-col gap-0.5 overflow-y-auto border-r bg-sidebar p-2 transition-transform select-none motion-reduce:transition-none md:static md:w-14 md:gap-1 md:translate-x-0 md:items-center md:px-0',
          drawer && 'translate-x-0'
        )}
      >
        {layout.groups.map((item) => (
          <ItemMenu
            key={item.id}
            closeLabel="Close group"
            onChangeLogo={() => {
              logoGroup.current = item.id
              logoInput.current?.click()
            }}
            onRemoveLogo={
              item.logo === null
                ? undefined
                : () => void removeLogo(item.id).catch(showError)
            }
            onSetFolder={() =>
              setPrompt({
                type: 'folder',
                target: 'group',
                id: item.id,
                name: item.name,
              })
            }
            onRename={() =>
              setPrompt({
                type: 'rename',
                target: 'group',
                id: item.id,
                name: item.name,
              })
            }
            onClose={() =>
              setPrompt({
                type: 'close',
                target: 'group',
                id: item.id,
                name: item.name,
              })
            }
          >
            <button
              className={cn(
                'relative flex h-8 flex-none items-center rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-10 md:justify-center md:px-0 md:text-[13px] md:font-medium',
                item.id === layout.activeGroup && 'bg-accent text-foreground'
              )}
              title={item.name}
              onClick={() => {
                send({ type: 'select', groupId: item.id, tabId: null })
                setDrawer(false)
              }}
            >
              {item.logo !== null && (
                <img
                  src={`/api/logos/${item.logo}`}
                  alt=""
                  className="mr-2 size-4 flex-none rounded-[3px] object-cover md:mr-0 md:size-6 md:rounded-[6px]"
                />
              )}
              {item.logo === null && (
                <span className="hidden md:inline">{initials(item.name)}</span>
              )}
              <span className="truncate md:hidden">{item.name}</span>
              {item.tabs.length > 0 && (
                <CountBadge
                  className="md:ring-sidebar ml-1.5 md:absolute md:right-0 md:bottom-0 md:ml-0 md:ring-2"
                  count={item.tabs.length}
                  alert={false}
                />
              )}
              {item.tabs.some((tab) => state.alerts.includes(tab.id)) && (
                <span className="bg-primary absolute top-1/2 right-2.5 size-2 -translate-y-1/2 rounded-full md:top-1 md:right-1 md:translate-y-0" />
              )}
            </button>
          </ItemMenu>
        ))}
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 flex-none items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors md:size-10 md:justify-center md:px-0"
          title="New group"
          onClick={() => {
            send({ type: 'createGroup' })
            setDrawer(false)
          }}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4 md:size-4.5" />
          <span className="md:hidden">New group</span>
        </button>
        <input
          ref={logoInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            const groupId = logoGroup.current
            event.target.value = ''
            if (file === undefined || groupId === null) return
            void uploadLogo(groupId, file).catch(showError)
          }}
        />
        <a
          href="/settings"
          className="text-muted-foreground hover:bg-accent hover:text-foreground mt-auto flex h-8 flex-none items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors md:size-10 md:justify-center md:px-0"
          title="Settings"
        >
          <HugeiconsIcon icon={Settings01Icon} className="size-4 md:size-4.5" />
          <span className="md:hidden">Settings</span>
        </a>
        {state.config.behavior.captureShortcuts && (
          <button
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 flex-none items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors md:size-10 md:justify-center md:px-0"
            title="Fullscreen"
            onClick={() => void toggleFullscreen().catch(showError)}
          >
            <HugeiconsIcon
              icon={FullScreenIcon}
              className="size-4 md:size-4.5"
            />
            <span className="md:hidden">Fullscreen</span>
          </button>
        )}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'flex h-8 flex-none select-none',
            visibleTabs.length === 1 ? 'bg-background' : 'bg-card'
          )}
        >
          <button
            className={cn(
              'text-muted-foreground hover:text-foreground grid w-9 flex-none place-items-center md:hidden',
              visibleTabs.length > 1 && 'border-b'
            )}
            aria-label="Groups"
            onClick={() => setDrawer(!drawer)}
          >
            <HugeiconsIcon icon={Menu01Icon} className="size-4" />
          </button>
          {group && (
            <>
              {minimizedTabs.length > 0 && (
                <MinimizedTabs
                  groupId={group.id}
                  tabs={minimizedTabs}
                  alerts={state.alerts}
                  bordered={visibleTabs.length > 1}
                />
              )}
              <div className="flex min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto">
                {visibleTabs.map((tab) => (
                  <ItemMenu
                    key={tab.id}
                    closeLabel="Close tab"
                    onMinimize={
                      visibleTabs.length > 1
                        ? () => send({ type: 'minimizeTab', id: tab.id })
                        : undefined
                    }
                    onRename={() =>
                      setPrompt({
                        type: 'rename',
                        target: 'tab',
                        id: tab.id,
                        name: tab.customName ?? '',
                      })
                    }
                    onClose={() => send({ type: 'closeTab', id: tab.id })}
                  >
                    <div
                      className={cn(
                        'group/tab relative flex min-w-28 flex-1 items-center justify-center border-r border-b px-7 text-xs text-muted-foreground transition-colors last:border-r-0 hover:text-foreground',
                        tab.id === tabId &&
                          'bg-background text-foreground border-b-transparent'
                      )}
                      onClick={() =>
                        send({
                          type: 'select',
                          groupId: group.id,
                          tabId: tab.id,
                        })
                      }
                    >
                      <span className="truncate">{tabTitle(tab)}</span>
                      {state.alerts.includes(tab.id) && (
                        <span className="bg-primary ml-1.5 size-1.5 flex-none rounded-full" />
                      )}
                      {state.config.behavior.showGitBranch &&
                        state.branches[tab.id] && (
                          <span className="ml-2 flex min-w-0 flex-none items-center gap-1 opacity-60">
                            <HugeiconsIcon
                              icon={GitBranchIcon}
                              className="size-3 flex-none"
                            />
                            <span className="max-w-40 truncate">
                              {state.branches[tab.id]}
                            </span>
                          </span>
                        )}
                      <TabProgress progress={state.progress[tab.id]} />
                      <button
                        className={cn(
                          'absolute left-1.5 grid size-4.5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity group-hover/tab:opacity-100 hover:bg-accent hover:text-foreground',
                          tab.id === tabId && 'pointer-coarse:opacity-100'
                        )}
                        aria-label="Close tab"
                        onClick={(event) => {
                          event.stopPropagation()
                          send({ type: 'closeTab', id: tab.id })
                        }}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                      </button>
                    </div>
                  </ItemMenu>
                ))}
              </div>
              <button
                className={cn(
                  'grid w-8 flex-none place-items-center text-muted-foreground transition-colors hover:text-foreground',
                  visibleTabs.length > 1 && 'border-l border-b'
                )}
                aria-label="New tab"
                title="New tab"
                onClick={() => send({ type: 'createTab', groupId: group.id })}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
              </button>
            </>
          )}
        </header>
        <div className="relative min-h-0 flex-1">
          {tabId !== null && <TerminalPane key={tabId} id={tabId} />}
          {tabId !== null && state.finding === tabId && (
            <FindBar key={tabId} id={tabId} />
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
      </main>
      {prompt?.type === 'rename' && (
        <RenameDialog
          key={prompt.id}
          target={prompt.target}
          id={prompt.id}
          name={prompt.name}
          onDone={() => setPrompt(null)}
        />
      )}
      {prompt?.type === 'folder' && (
        <FolderDialog
          key={prompt.id}
          groupId={prompt.id}
          directory={
            layout.groups.find((item) => item.id === prompt.id)?.directory ??
            null
          }
          onDone={() => setPrompt(null)}
        />
      )}
      <AlertDialog
        open={prompt?.type === 'close'}
        onOpenChange={(open) => {
          if (!open) setPrompt(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close “{prompt?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All terminals in this group will be closed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (prompt) send({ type: 'closeGroup', id: prompt.id })
              }}
            >
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={logoError !== null}
        onOpenChange={(open) => {
          if (!open) setLogoError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logo not updated</AlertDialogTitle>
            <AlertDialogDescription>{logoError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state.status !== 'active' && <StatusOverlay status={state.status} />}
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

function initials(name: string) {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
