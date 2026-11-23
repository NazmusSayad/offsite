import { Cancel01Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import { type ReactNode, useState, useSyncExternalStore } from 'react'
import { worktreeBranch } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { MachineLogo } from '@/constants/machine-icons'
import { machineOf, useStore } from '@/lib/store'
import { useTerminalPlace, useTerminalView } from '@/lib/url'
import { cn } from '@/lib/utils'
import { closeTab } from './close-tab'
import { TabProgress } from './panel'
import { getState, subscribe, tabTitle, viewTabs } from './session'

export function MobileTerminalHeader(props: {
  machine: string
  leading: ReactNode
  children: ReactNode
}) {
  const state = useSyncExternalStore(subscribe, getState)
  const [open, setOpen] = useState(false)
  const view = useTerminalView()
  const place = useTerminalPlace()
  const machine = useStore((store) => machineOf(store, props.machine))
  const project = useStore((store) =>
    store.projects.find(
      (item) => item.machine === props.machine && item.id === place.projectId
    )
  )
  const worktree = useStore((store) =>
    store.worktrees.find(
      (item) => item.machine === props.machine && item.id === place.worktreeId
    )
  )
  const total = useStore((store) =>
    store.machines
      .filter((item) => item.status === 'online')
      .reduce((sum, item) => sum + item.terminals.length, 0)
  )
  const tabId = state.layout.active[view] ?? null
  const selected = viewTabs(state.layout, view).find((tab) => tab.id === tabId)

  return (
    <header className="bg-background flex h-(--workspace-topbar-height) flex-none items-center border-b select-none">
      {props.leading}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="relative flex min-w-0 flex-1 items-center self-stretch pl-2 text-left">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground truncate">
                {selected === undefined ? 'Terminal' : tabTitle(selected)}
              </span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
                <MachineLogo icon={machine.icon} className="size-3 shrink-0" />
                <span className="min-w-0 shrink-100 truncate">
                  {machine.name}
                </span>
                {place.projectId !== null && (
                  <>
                    <span className="shrink-0">/</span>
                    <ProjectIcon
                      machine={props.machine}
                      projectId={place.projectId}
                      className="size-3 shrink-0"
                    />
                    <span className="min-w-0 truncate">
                      {project?.name ?? 'Removed project'}
                    </span>
                  </>
                )}
                {place.worktreeId !== null && (
                  <>
                    <HugeiconsIcon
                      icon={WorktreeIcon}
                      className="size-3 shrink-0"
                    />
                    <span className="min-w-0 truncate">
                      {worktree === undefined
                        ? 'Removed worktree'
                        : worktreeBranch(worktree)}
                    </span>
                  </>
                )}
              </span>
            </span>
            <span className="text-muted-foreground relative grid w-11 flex-none place-items-center self-stretch">
              <HugeiconsIcon icon={Menu01Icon} className="size-4.5" />
              {total > 0 && (
                <span
                  className={cn(
                    'border-background absolute top-2.5 right-1 grid h-3.5 min-w-3.5 place-items-center rounded-full border px-0.5 text-[9px] leading-none font-medium tabular-nums',
                    state.alerts.some((id) => id !== tabId)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground/75 bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))]'
                  )}
                >
                  {total}
                </span>
              )}
            </span>
            {selected !== undefined && (
              <TabProgress progress={state.progress[selected.id]} />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 max-w-[calc(100vw-1rem)] p-1"
          onClick={() => setOpen(false)}
        >
          {props.children}
        </PopoverContent>
      </Popover>
      {selected !== undefined && (
        <button
          className="text-muted-foreground hover:text-foreground grid w-11 flex-none place-items-center self-stretch transition-colors"
          aria-label="Close tab"
          title="Close tab"
          onClick={() => void closeTab(selected.id)}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      )}
    </header>
  )
}
