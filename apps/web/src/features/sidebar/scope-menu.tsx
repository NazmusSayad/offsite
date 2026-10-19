import {
  Add01Icon,
  ChevronDownIcon,
  ComputerIcon,
  InboxIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { machineKey } from '@/api/machines'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { activityOf, type MachineProject, useStore } from '@/lib/store'

export function ScopeMenu(props: {
  scope: { machine: string; projectId: string } | null
  onScope: (scope: { machine: string; projectId: string } | null) => void
  onEdit: (project: MachineProject) => void
  onAddProject: () => void
  onAddMachine: () => void
}) {
  const machines = useStore((state) => state.machines)
  const registered = useStore((state) => state.projects)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const [picking, setPicking] = useState(false)
  const projects = [...registered].sort(
    (a, b) =>
      machines.findIndex((item) => item.id === a.machine) -
        machines.findIndex((item) => item.id === b.machine) ||
      a.name.localeCompare(b.name)
  )
  const attention = sessions.filter((session) => {
    const activity = activityOf(machines, session.machine, session.id)
    return (
      activity?.running === true ||
      activity?.waiting === true ||
      Object.values(activity?.tasks ?? {}).includes('running') ||
      unseen.includes(machineKey(session.machine, session.id))
    )
  })

  function projectAt(machine: string, projectId: string) {
    return registered.find(
      (project) => project.machine === machine && project.id === projectId
    )
  }

  function machineLabel(id: string) {
    const machine = machines.find((item) => item.id === id)
    if (machine === undefined) {
      return ''
    }
    if (machine.status === 'online') {
      return machine.name
    }
    if (machine.status === 'unpaired') {
      return `${machine.name} · needs pairing`
    }
    return `${machine.name} · offline`
  }

  function machineIcon(id: string) {
    const machine = machines.find((item) => item.id === id)
    if (machine === undefined) {
      return null
    }
    return (
      <HugeiconsIcon
        icon={machineIcons[machine.icon]}
        className="mr-1 inline size-3 align-[-2px]"
      />
    )
  }

  return (
    <DropdownMenu open={picking} onOpenChange={setPicking}>
      <DropdownMenuTrigger asChild>
        <button
          className="hover:bg-sidebar-row-hover data-[state=open]:bg-sidebar-row-hover -ml-1.5 flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-[var(--control-radius)] px-1.5 text-sm font-medium"
          title={
            props.scope === null
              ? 'Inbox'
              : projectAt(props.scope.machine, props.scope.projectId)?.path
          }
        >
          {props.scope === null ? (
            <HugeiconsIcon
              icon={InboxIcon}
              className="size-4 shrink-0 text-(--sidebar-icon-color)"
            />
          ) : (
            <ProjectIcon
              machine={props.scope.machine}
              projectId={props.scope.projectId}
              className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
            />
          )}
          <span className="truncate">
            {props.scope === null
              ? 'Inbox'
              : projectAt(props.scope.machine, props.scope.projectId)?.name}
          </span>
          <HugeiconsIcon
            icon={ChevronDownIcon}
            className="text-sidebar-muted-foreground size-3.5 shrink-0"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuRadioGroup
          value={
            props.scope === null
              ? ''
              : machineKey(props.scope.machine, props.scope.projectId)
          }
        >
          <DropdownMenuRadioItem
            value=""
            className="pr-9 pl-8 *:data-[slot=dropdown-menu-radio-item-indicator]:right-auto *:data-[slot=dropdown-menu-radio-item-indicator]:left-2"
            onSelect={() => props.onScope(null)}
          >
            <HugeiconsIcon icon={InboxIcon} />
            <span className="min-w-0 flex-1 truncate">Inbox</span>
            {attention.length > 0 && (
              <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                {attention.length}
              </span>
            )}
          </DropdownMenuRadioItem>
          {projects.map((project) => {
            const count = attention.filter(
              (session) =>
                session.machine === project.machine &&
                session.projectId === project.id
            ).length
            return (
              <DropdownMenuRadioItem
                key={machineKey(project.machine, project.id)}
                value={machineKey(project.machine, project.id)}
                title={project.path}
                className="pr-2 pl-8 *:data-[slot=dropdown-menu-radio-item-indicator]:right-auto *:data-[slot=dropdown-menu-radio-item-indicator]:left-2"
                onSelect={() =>
                  props.onScope({
                    machine: project.machine,
                    projectId: project.id,
                  })
                }
                onContextMenu={(event) => {
                  event.preventDefault()
                  setPicking(false)
                  props.onEdit(project)
                }}
              >
                <ProjectIcon
                  machine={project.machine}
                  projectId={project.id}
                  className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                />
                <span className="min-w-0 flex-1 truncate">
                  {project.name}
                  {machines.length > 1 && (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {machineIcon(project.machine)}
                      {machineLabel(project.machine)}
                    </span>
                  )}
                </span>
                {count > 0 && (
                  <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                    {count}
                  </span>
                )}
                <button
                  className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 -my-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm [&_svg]:size-3.5"
                  title="Configure project"
                  aria-label={`Configure ${project.name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setPicking(false)
                    props.onEdit(project)
                  }}
                >
                  <HugeiconsIcon icon={Settings01Icon} />
                </button>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="pl-8" onSelect={props.onAddProject}>
          <HugeiconsIcon icon={Add01Icon} />
          Add project…
        </DropdownMenuItem>
        <DropdownMenuItem className="pl-8" onSelect={props.onAddMachine}>
          <HugeiconsIcon icon={ComputerIcon} />
          Add machine…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
