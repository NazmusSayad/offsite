import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { type ReactNode, useEffect, useSyncExternalStore } from 'react'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { type Machine, useStore } from '@/lib/store'
import { useTerminalPage, useTerminalView } from '@/lib/url'
import { cn } from '@/lib/utils'
import { NewTerminalItems } from './new-terminal-button'
import { createTab, showGroup } from './page'
import { TerminalPanel } from './panel'
import { getState, subscribe } from './session'

type Group = {
  machine: Machine
  view: string
  name: string
  count: number
}

export function TerminalPage(props: {
  machine: string
  leading: ReactNode
  mobile: boolean
}) {
  useSyncExternalStore(subscribe, getState)
  const machines = useStore((store) => store.machines)
  const online = machines.filter((machine) => machine.status === 'online')
  const view = useTerminalView()
  const groups = useGroups()
  const current = groups.find(
    (group) => group.machine.id === props.machine && group.view === view
  )

  useEffect(() => {
    localStorage.setItem('lastTerminal', props.machine)
    localStorage.setItem('lastTerminalView', view)
  }, [props.machine, view])

  const newTerminal = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={online.length === 0}>
        <button
          className="text-muted-foreground enabled:hover:text-foreground grid w-11 flex-none place-items-center self-stretch transition-colors"
          aria-label="New terminal"
          title="New terminal"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <NewTerminalItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (props.mobile) {
    return (
      <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <header className="grid h-(--workspace-topbar-height) flex-none grid-cols-[auto_1fr_auto] items-center border-b select-none">
          {props.leading}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground flex min-w-0 items-center justify-center gap-1.5 self-stretch px-1 text-[13px]">
                {current !== undefined && <GroupIcon group={current} />}
                <span className="truncate">{current?.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-auto">
              {groups.map((group) => (
                <DropdownMenuItem
                  key={`${group.machine.id}:${group.view}`}
                  className={cn(group.view !== GLOBAL_TERMINALS && 'pl-7')}
                  onSelect={() => showGroup(group.machine.id, group.view)}
                >
                  <GroupIcon group={group} />
                  <span className="max-w-60 truncate">{group.name}</span>
                  <GroupCount
                    count={group.count}
                    alert={alerted(group, props.machine)}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {newTerminal}
        </header>
        <div className="min-h-0 flex-1">
          <TerminalPanel view={view} page />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <TerminalPanel view={view} page tabSize="lg" leading={props.leading} />
      </div>
    </main>
  )
}

export function TerminalGroups() {
  useSyncExternalStore(subscribe, getState)
  const page = useTerminalPage()
  const view = useTerminalView()
  const groups = useGroups().filter(
    (group) =>
      group.machine.status === 'online' && group.machine.terminals.length > 0
  )

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="flex max-h-52 flex-col gap-px overflow-y-auto">
      {groups.map((group) => (
        <div
          key={`${group.machine.id}:${group.view}`}
          className={cn(
            'group/row text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground relative shrink-0 rounded-[var(--control-radius)]',
            group.machine.id === page &&
              group.view === view &&
              'bg-sidebar-row-hover text-sidebar-foreground'
          )}
        >
          <button
            className={cn(
              'flex h-7 w-full cursor-pointer items-center gap-2 rounded-[var(--control-radius)] pr-2.5 pl-7 text-left text-[13px]',
              group.view !== GLOBAL_TERMINALS && 'pl-11'
            )}
            onClick={() =>
              group.count === 0
                ? void createTab(group.machine.id, null)
                : showGroup(group.machine.id, group.view)
            }
          >
            <GroupIcon group={group} />
            <span className="truncate">{group.name}</span>
            <GroupCount
              count={group.count}
              alert={alerted(group, page)}
              className="group-hover/row:invisible"
            />
          </button>
          <button
            className="text-muted-foreground hover:text-foreground absolute top-0.5 right-1 grid size-6 cursor-pointer place-items-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden"
            aria-label="New terminal"
            title="New terminal"
            onClick={() =>
              void createTab(
                group.machine.id,
                group.view === GLOBAL_TERMINALS ? null : group.view
              )
            }
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

function useGroups(): Group[] {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)

  return machines.flatMap((machine) => {
    const tabs = machine.status === 'online' ? machine.terminals : []
    const projectIds = [
      ...new Set(
        tabs.flatMap((tab) => (tab.projectId === null ? [] : [tab.projectId]))
      ),
    ]
    return [
      {
        machine,
        view: GLOBAL_TERMINALS,
        name: machine.name,
        count: tabs.filter((tab) => tab.projectId === null).length,
      },
      ...projectIds.map((projectId) => ({
        machine,
        view: projectId,
        name:
          projects.find(
            (project) =>
              project.machine === machine.id && project.id === projectId
          )?.name ?? 'Removed project',
        count: tabs.filter((tab) => tab.projectId === projectId).length,
      })),
    ]
  })
}

function alerted(group: Group, machine: string | null) {
  const state = getState()
  return (
    group.machine.id === machine &&
    state.layout.tabs.some(
      (tab) =>
        (tab.projectId ?? GLOBAL_TERMINALS) === group.view &&
        state.alerts.includes(tab.id)
    )
  )
}

function GroupIcon(props: { group: Group }) {
  if (props.group.view === GLOBAL_TERMINALS) {
    return (
      <MachineLogo
        icon={props.group.machine.icon}
        className="size-4 shrink-0"
      />
    )
  }
  return (
    <ProjectIcon
      machine={props.group.machine.id}
      projectId={props.group.view}
      className="size-4 shrink-0"
    />
  )
}

function GroupCount(props: {
  count: number
  alert: boolean
  className?: string
}) {
  if (props.count === 0) {
    return null
  }
  return (
    <span
      className={cn(
        'ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums',
        props.alert
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))]',
        props.className
      )}
    >
      {props.count}
    </span>
  )
}
