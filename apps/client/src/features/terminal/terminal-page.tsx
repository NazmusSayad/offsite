import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import {
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { MachineLogo } from '@/constants/machine-icons'
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
          className="text-muted-foreground enabled:hover:text-foreground grid w-11 flex-none place-items-center self-stretch transition-colors"
          aria-label="New terminal"
          title="New terminal"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        {online.flatMap((machine) => [
          <DropdownMenuItem
            key={machine.id}
            onSelect={() => create(machine.id, null)}
          >
            <MachineLogo icon={machine.icon} />
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
                  <GroupCount count={group.count} alert={alerted(group)} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {newTerminal}
        </header>
        <div className="min-h-0 flex-1">
          <TerminalPanel view={view} />
        </div>
      </main>
    )
  }

  return (
    <main className="bg-background flex min-w-0 flex-1 overflow-hidden">
      <nav className="bg-sidebar flex w-56 flex-none flex-col border-r">
        {props.leading && (
          <div className="flex h-(--workspace-topbar-height) flex-none items-center px-1.5">
            {props.leading}
          </div>
        )}
        <div className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
          {groups.map((group) => (
            <div
              key={`${group.machine.id}:${group.view}`}
              className={cn(
                'group/row hover:bg-accent/60 relative rounded-md transition-colors has-[[data-state=open]]:bg-accent/60',
                group === current && 'bg-accent'
              )}
            >
              <button
                className={cn(
                  'text-muted-foreground group-hover/row:text-foreground group-has-[[data-state=open]]/row:text-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors',
                  group.view !== GLOBAL_TERMINALS && 'pl-7',
                  group === current && 'text-foreground'
                )}
                onClick={() => showGroup(group.machine.id, group.view)}
              >
                <GroupIcon group={group} />
                <span className="truncate">{group.name}</span>
                <GroupCount count={group.count} alert={alerted(group)} />
              </button>
              {group.view === GLOBAL_TERMINALS &&
                group.machine.status === 'online' && (
                  <DeviceNewTerminal
                    machine={group.machine}
                    onCreate={(projectId) =>
                      create(group.machine.id, projectId)
                    }
                  />
                )}
            </div>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TerminalPanel view={view} tabSize="lg" />
      </div>
    </main>
  )
}

function DeviceNewTerminal(props: {
  machine: Machine
  onCreate: (projectId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const allProjects = useStore((store) => store.projects)
  const projects = allProjects.filter(
    (project) => project.machine === props.machine.id
  )

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={100}
      closeDelay={150}
    >
      <HoverCardTrigger asChild>
        <button
          className="bg-accent text-muted-foreground hover:text-foreground absolute top-1 right-1 grid size-6 place-items-center rounded-md opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          aria-label={`New terminal on ${props.machine.name}`}
          onClick={() => props.onCreate(null)}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </HoverCardTrigger>
      {projects.length > 0 && (
        <HoverCardContent
          side="right"
          align="start"
          className="max-h-80 w-auto max-w-52 min-w-32 overflow-y-auto p-1"
        >
          {projects.map((project) => (
            <button
              key={project.id}
              className="hover:bg-accent hover:text-accent-foreground flex min-h-7 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm"
              onClick={() => {
                setOpen(false)
                props.onCreate(project.id)
              }}
            >
              <ProjectIcon
                machine={props.machine.id}
                projectId={project.id}
                className="size-4 shrink-0"
              />
              <span className="truncate">{project.name}</span>
            </button>
          ))}
        </HoverCardContent>
      )}
    </HoverCard>
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
