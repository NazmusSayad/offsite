import {
  Add01Icon,
  CenterFocusIcon,
  ChevronDownIcon,
  Settings01Icon,
  SlidersHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { NO_PROJECT } from '@offsite/core/projects'
import { Fragment, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { machineKey } from '@/api/machines'
import { ProjectIcon } from '@/components/icons'
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
import { MachineLogo } from '@/constants/machine-icons'
import {
  activityOf,
  type MachineProject,
  showSettingsPage,
  update,
  useStore,
} from '@/lib/store'

export function ScopeMenu(props: {
  scope: { machine: string; projectId: string } | null
  onScope: (scope: { machine: string; projectId: string } | null) => void
  onEdit: (project: MachineProject) => void
  onAddProject: (machine: string) => void
}) {
  const scope = props.scope
  const project = useStore((state) =>
    scope === null
      ? undefined
      : state.projects.find(
          (item) =>
            item.machine === scope.machine && item.id === scope.projectId
        )
  )
  const [picking, setPicking] = useState(false)
  useHotkeys('mod+p', () => setPicking(!picking), {
    enableOnFormTags: true,
    preventDefault: true,
  })

  return (
    <DropdownMenu open={picking} onOpenChange={setPicking}>
      <DropdownMenuTrigger asChild>
        <button
          className="hover:bg-sidebar-row-hover data-[state=open]:bg-sidebar-row-hover -ml-1.5 flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-[var(--control-radius)] ps-2 pe-1.5 text-sm font-medium"
          title={props.scope === null ? 'Inbox' : project?.path}
        >
          {props.scope !== null && (
            <ProjectIcon
              machine={props.scope.machine}
              projectId={props.scope.projectId}
              className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
            />
          )}
          <span className="truncate">
            {props.scope === null
              ? 'Inbox'
              : props.scope.projectId === NO_PROJECT
                ? 'Chat'
                : project?.name}
          </span>
          <HugeiconsIcon
            icon={ChevronDownIcon}
            className="text-sidebar-muted-foreground size-3.5 shrink-0"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <ProjectMenuItems
          inbox
          scope={props.scope}
          onScope={props.onScope}
          onEdit={props.onEdit}
          onAddProject={props.onAddProject}
          onClose={() => setPicking(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProjectMenuItems(props: {
  inbox: boolean
  scope: { machine: string; projectId: string } | null
  onScope: (scope: { machine: string; projectId: string } | null) => void
  onEdit: (project: MachineProject) => void
  onAddProject: (machine: string) => void
  onClose: () => void
}) {
  const machines = useStore((state) => state.machines)
  const registered = useStore((state) => state.projects)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const groups = machines
    .map((machine) => ({
      machine,
      projects: registered.filter(
        (project) =>
          project.machine === machine.id &&
          !project.hidden &&
          !project.scratch &&
          project.parentId === null
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

  function scratchAttention(machine: string) {
    return attention.filter(
      (session) =>
        session.machine === machine &&
        projectAt(machine, session.projectId)?.scratch === true
    ).length
  }

  function manageButton(machine: (typeof machines)[number]) {
    return (
      <DropdownMenuItem
        className="text-muted-foreground grid size-7 min-h-0 shrink-0 place-items-center rounded-sm p-0"
        title={`Manage projects on ${machine.name}`}
        aria-label={`Manage projects on ${machine.name}`}
        disabled={machine.status !== 'online'}
        onSelect={() => {
          showSettingsPage('Projects')
          update({ settingsMachine: machine.id })
        }}
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3.5" />
      </DropdownMenuItem>
    )
  }

  function chatChip(machine: (typeof machines)[number]) {
    return (
      <DropdownMenuRadioItem
        value={machineKey(machine.id, NO_PROJECT)}
        className="text-muted-foreground data-[state=checked]:bg-foreground/10 data-[state=checked]:text-foreground h-7 min-h-0 shrink-0 gap-1 px-2 py-0 text-xs *:data-[slot=dropdown-menu-radio-item-indicator]:hidden"
        title={`Threads on ${machine.name} without a project`}
        onSelect={() =>
          props.onScope({ machine: machine.id, projectId: NO_PROJECT })
        }
      >
        <ProjectIcon
          machine={machine.id}
          projectId={NO_PROJECT}
          className="size-3.5 shrink-0"
        />
        Chat
        {scratchAttention(machine.id) > 0 && (
          <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
            {scratchAttention(machine.id)}
          </span>
        )}
      </DropdownMenuRadioItem>
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
    <DropdownMenuRadioGroup
      value={
        props.scope === null
          ? ''
          : machineKey(props.scope.machine, props.scope.projectId)
      }
    >
      {props.inbox && (
        <DropdownMenuRadioItem value="" onSelect={() => props.onScope(null)}>
          <HugeiconsIcon
            icon={CenterFocusIcon}
            className="text-muted-foreground size-5 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate">Inbox</span>
          {attention.length > 0 && (
            <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
              {attention.length}
            </span>
          )}
        </DropdownMenuRadioItem>
      )}

      {props.inbox && groups.length > 0 && <DropdownMenuSeparator />}

      {groups.map((group, index) => (
        <Fragment key={group.machine.id}>
          {index > 0 && <DropdownMenuSeparator />}
          {machines.length > 1 && (
            <div className="flex items-center">
              <DropdownMenuLabel className="flex min-w-0 flex-1 items-center gap-2 pl-[0.52rem]!">
                <MachineLogo
                  icon={group.machine.icon}
                  className="size-3.5 shrink-0"
                />
                <span className="truncate">{machineLabel(group.machine)}</span>
              </DropdownMenuLabel>
              {group.machine.system?.scratchAvailable === true &&
                chatChip(group.machine)}
              <div className="flex shrink-0 items-center">
                {manageButton(group.machine)}
                <DropdownMenuItem
                  className="text-muted-foreground grid size-7 min-h-0 shrink-0 place-items-center rounded-sm p-0"
                  title={`Add project to ${group.machine.name}`}
                  aria-label={`Add project to ${group.machine.name}`}
                  disabled={group.machine.status !== 'online'}
                  onSelect={() => props.onAddProject(group.machine.id)}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                </DropdownMenuItem>
              </div>
            </div>
          )}
          {group.projects.map((project) => {
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
                className="group/project"
                onSelect={() =>
                  props.onScope({
                    machine: project.machine,
                    projectId: project.id,
                  })
                }
                onContextMenu={(event) => {
                  event.preventDefault()
                  props.onClose()
                  props.onEdit(project)
                }}
              >
                <ProjectIcon
                  machine={project.machine}
                  projectId={project.id}
                  className="size-5 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {count > 0 && (
                  <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                    {count}
                  </span>
                )}
                <div className="-my-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-data-highlighted/project:opacity-100 pointer-coarse:hidden">
                  <button
                    className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 grid size-5 cursor-pointer place-items-center rounded-sm [&_svg]:size-3.5"
                    title="Configure project"
                    aria-label={`Configure ${project.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      props.onClose()
                      props.onEdit(project)
                    }}
                  >
                    <HugeiconsIcon icon={Settings01Icon} />
                  </button>
                </div>
              </DropdownMenuRadioItem>
            )
          })}
        </Fragment>
      ))}
      {machines.length === 1 && (
        <>
          {(props.inbox || groups.length > 0) && <DropdownMenuSeparator />}
          <div className="flex items-center">
            <DropdownMenuItem
              className="flex-1"
              onSelect={() => props.onAddProject(machines[0].id)}
            >
              <HugeiconsIcon icon={Add01Icon} />
              Add project
            </DropdownMenuItem>
            <div className="flex shrink-0 items-center">
              {machines[0].system?.scratchAvailable === true &&
                chatChip(machines[0])}
              {manageButton(machines[0])}
            </div>
          </div>
        </>
      )}
    </DropdownMenuRadioGroup>
  )
}
