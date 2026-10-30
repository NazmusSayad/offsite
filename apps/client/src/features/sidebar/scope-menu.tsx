import {
  Add01Icon,
  ChevronDownIcon,
  InboxIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Reorder } from 'motion/react'
import { Fragment, useRef, useState } from 'react'
import { machineKey } from '@/api/machines'
import { reorderProjects } from '@/api/projects'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  activityOf,
  type MachineProject,
  showError,
  useStore,
} from '@/lib/store'

export function ScopeMenu(props: {
  scope: { machine: string; projectId: string } | null
  onScope: (scope: { machine: string; projectId: string } | null) => void
  onEdit: (project: MachineProject) => void
  onAddProject: (machine: string) => void
}) {
  const machines = useStore((state) => state.machines)
  const registered = useStore((state) => state.projects)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const [picking, setPicking] = useState(false)
  const [order, setOrder] = useState<{ machine: string; ids: string[] } | null>(
    null
  )
  const dragged = useRef(false)
  const groups = machines
    .map((machine) => ({
      machine,
      projects: registered
        .filter((project) => project.machine === machine.id)
        .sort((a, b) =>
          order !== null && order.machine === machine.id
            ? order.ids.indexOf(a.id) - order.ids.indexOf(b.id)
            : 0
        ),
    }))
    .filter((group) => machines.length > 1 || group.projects.length > 0)
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

  function machineLabel(machine: (typeof machines)[number]) {
    if (machine.status === 'online') {
      return machine.name
    }
    if (machine.status === 'unpaired') {
      return `${machine.name} · needs pairing`
    }
    return `${machine.name} · offline`
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

          {groups.length > 0 && <DropdownMenuSeparator />}

          {groups.map(({ machine, projects }, index) => (
            <Fragment key={machine.id}>
              {index > 0 && <DropdownMenuSeparator />}
              {machines.length > 1 && (
                <div className="flex items-center">
                  <DropdownMenuLabel className="flex min-w-0 flex-1 items-center gap-2 pl-2.5">
                    <HugeiconsIcon
                      icon={machineIcons[machine.icon]}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate">{machineLabel(machine)}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    className="text-muted-foreground grid size-7 shrink-0 place-items-center p-0"
                    title={`Add project to ${machine.name}`}
                    aria-label={`Add project to ${machine.name}`}
                    disabled={machine.status !== 'online'}
                    onSelect={() => props.onAddProject(machine.id)}
                  >
                    <HugeiconsIcon icon={Add01Icon} />
                  </DropdownMenuItem>
                </div>
              )}
              <Reorder.Group
                as="div"
                axis="y"
                values={projects.map((project) => project.id)}
                onReorder={(ids) => setOrder({ machine: machine.id, ids })}
              >
                {projects.map((project) => {
                  const count = attention.filter(
                    (session) =>
                      session.machine === project.machine &&
                      session.projectId === project.id
                  ).length
                  return (
                    <Reorder.Item
                      key={machineKey(project.machine, project.id)}
                      as="div"
                      value={project.id}
                      className="relative"
                      onDragStart={() => {
                        dragged.current = true
                      }}
                      onDragEnd={async () => {
                        if (order === null) {
                          return
                        }
                        try {
                          await reorderProjects(order.machine, order.ids)
                        } catch (error) {
                          showError(error)
                        }
                        setOrder(null)
                      }}
                    >
                      <DropdownMenuRadioItem
                        value={machineKey(project.machine, project.id)}
                        title={project.path}
                        className="group/project pr-2 pl-8 *:data-[slot=dropdown-menu-radio-item-indicator]:right-auto *:data-[slot=dropdown-menu-radio-item-indicator]:left-2"
                        onPointerDown={() => {
                          dragged.current = false
                        }}
                        onSelect={(event) => {
                          if (dragged.current) {
                            event.preventDefault()
                            return
                          }
                          props.onScope({
                            machine: project.machine,
                            projectId: project.id,
                          })
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setPicking(false)
                          props.onEdit(project)
                        }}
                      >
                        <ProjectIcon
                          machine={project.machine}
                          projectId={project.id}
                          className="size-5 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                        {count > 0 && (
                          <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                            {count}
                          </span>
                        )}
                        <button
                          className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 -my-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm opacity-0 transition-opacity group-data-highlighted/project:opacity-100 pointer-coarse:opacity-100 [&_svg]:size-3.5"
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
                    </Reorder.Item>
                  )
                })}
              </Reorder.Group>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
        {machines.length === 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="pl-8"
              onSelect={() => props.onAddProject(machines[0].id)}
            >
              <HugeiconsIcon icon={Add01Icon} />
              Add project…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
