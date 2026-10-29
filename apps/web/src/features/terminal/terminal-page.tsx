import { Add01Icon, ChevronDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { type ReactNode, useEffect, useSyncExternalStore } from 'react'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Machine, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { TerminalPanel } from './panel'
import { getState, pageView, sendTo, showGroup, subscribe } from './session'

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
  const state = useSyncExternalStore(subscribe, getState)
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)
  const online = machines.filter((machine) => machine.status === 'online')
  const view = pageView()
  const groups: Group[] = machines.flatMap((machine) => {
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
  const current = groups.find(
    (group) => group.machine.id === props.machine && group.view === view
  )

  useEffect(() => {
    localStorage.setItem('lastTerminal', props.machine)
  }, [props.machine])

  function create(machine: string, projectId: string | null) {
    sendTo(machine, { type: 'createTab', projectId })
    showGroup(machine, projectId ?? GLOBAL_TERMINALS)
  }

  function alerted(group: Group) {
    return (
      group.machine.id === props.machine &&
      state.layout.tabs.some(
        (tab) =>
          (tab.projectId ?? GLOBAL_TERMINALS) === group.view &&
          state.alerts.includes(tab.id)
      )
    )
  }

  const newTerminal = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={online.length === 0}>
        <button
          className="text-muted-foreground enabled:hover:text-foreground grid size-7 flex-none place-items-center rounded-md transition-colors"
          aria-label="New terminal"
          title="New terminal"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        {online.flatMap((machine) => [
          <DropdownMenuItem
            key={machine.id}
            onSelect={() => create(machine.id, null)}
          >
            <HugeiconsIcon icon={machineIcons[machine.icon]} />
            <span className="max-w-60 truncate">{machine.name}</span>
          </DropdownMenuItem>,
          ...projects
            .filter((project) => project.machine === machine.id)
            .map((project) => (
              <DropdownMenuItem
                key={`${machine.id}:${project.id}`}
                className="pl-7"
                onSelect={() => create(machine.id, project.id)}
              >
                <ProjectIcon
                  machine={machine.id}
                  projectId={project.id}
                  className="size-4"
                />
                <span className="max-w-60 truncate">{project.name}</span>
              </DropdownMenuItem>
            )),
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (props.mobile) {
    return (
      <main className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <TerminalPanel
          view={view}
          tabSize="lg"
          leading={
            <>
              {props.leading}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground flex max-w-48 min-w-0 items-center gap-1.5 px-1 text-[13px]">
                    {current !== undefined && <GroupIcon group={current} />}
                    <span className="truncate">{current?.name}</span>
                    <HugeiconsIcon
                      icon={ChevronDownIcon}
                      className="size-3 shrink-0"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-auto">
                  {groups.map((group) => (
                    <DropdownMenuItem
                      key={`${group.machine.id}:${group.view}`}
                      className={cn(group.view !== GLOBAL_TERMINALS && 'pl-7')}
                      onSelect={() => showGroup(group.machine.id, group.view)}
                    >
                      <GroupIcon group={group} />
                      <span className="max-w-60 truncate">{group.name}</span>
                      <GroupCount count={group.count} alert={alerted(group)} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {newTerminal}
            </>
          }
        />
      </main>
    )
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 overflow-hidden">
      <nav className="bg-sidebar flex w-56 flex-none flex-col border-r">
        <div className="flex h-(--workspace-topbar-height) flex-none items-center gap-1 px-1.5">
          {props.leading}
          <span className="text-muted-foreground min-w-0 flex-1 truncate px-1.5 text-[13px]">
            Terminals
          </span>
          {newTerminal}
        </div>
        <div className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
          {groups.map((group) => (
            <button
              key={`${group.machine.id}:${group.view}`}
              className={cn(
                'text-muted-foreground hover:bg-accent/60 hover:text-foreground flex h-8 items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
                group.view !== GLOBAL_TERMINALS && 'pl-7',
                group === current && 'bg-accent text-foreground'
              )}
              onClick={() => showGroup(group.machine.id, group.view)}
            >
              <GroupIcon group={group} />
              <span className="truncate">{group.name}</span>
              <GroupCount count={group.count} alert={alerted(group)} />
            </button>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TerminalPanel view={view} tabSize="lg" />
      </div>
    </main>
  )
}

function GroupIcon(props: { group: Group }) {
  if (props.group.view === GLOBAL_TERMINALS) {
    return (
      <HugeiconsIcon
        icon={machineIcons[props.group.machine.icon]}
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

function GroupCount(props: { count: number; alert: boolean }) {
  if (props.count === 0) {
    return null
  }
  return (
    <span
      className={cn(
        'ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full px-1 text-[10px] leading-none font-medium tabular-nums',
        props.alert
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))]'
      )}
    >
      {props.count}
    </span>
  )
}
