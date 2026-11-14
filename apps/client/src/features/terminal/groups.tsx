import {
  GLOBAL_TERMINALS,
  type TerminalPlace,
  terminalViewOf,
} from '@offsite/core/terminal'
import { rankProjects, worktreeBranch } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import {
  type Machine,
  type MachineProject,
  type MachineWorktree,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { getState } from './session'

export type Group = {
  machine: Machine
  view: string
  place: TerminalPlace
  name: string
  count: number
  path: string | null
}

export function useGroups(): Group[] {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)
  const worktrees = useStore((store) => store.worktrees)

  return machines.flatMap((machine) => {
    const tabs = machine.status === 'online' ? machine.terminals : []
    const ranked = rankProjects(
      projects.filter(
        (project) =>
          machine.status === 'online' &&
          project.machine === machine.id &&
          !project.hidden &&
          !project.scratch
      )
    )
    const places = [
      ...[
        ...ranked.top,
        ...ranked.more.filter((root) =>
          tabs.some((tab) => tab.projectId === root.id)
        ),
      ].flatMap((root): TerminalPlace[] => [
        { projectId: root.id, worktreeId: null },
        ...worktrees
          .filter(
            (worktree) =>
              worktree.machine === machine.id && worktree.projectId === root.id
          )
          .map((worktree) => ({ projectId: root.id, worktreeId: worktree.id })),
      ]),
      ...tabs
        .filter((tab) => tab.projectId !== null)
        .map((tab) => ({
          projectId: tab.projectId,
          worktreeId: tab.worktreeId,
        })),
    ]
    const unique = new Map(
      places.map((place) => [terminalViewOf(place), place])
    )
    return [
      {
        machine,
        view: GLOBAL_TERMINALS,
        place: { projectId: null, worktreeId: null },
        name: machine.name,
        count: tabs.filter((tab) => tab.projectId === null).length,
        path: null,
      },
      ...[...unique].map((entry) => {
        const project = projects.find(
          (item) =>
            item.machine === machine.id && item.id === entry[1].projectId
        )
        const worktree =
          entry[1].worktreeId === null
            ? null
            : worktrees.find(
                (item) =>
                  item.machine === machine.id && item.id === entry[1].worktreeId
              )
        return {
          machine,
          view: entry[0],
          place: entry[1],
          name: groupName(project, worktree),
          count: tabs.filter((tab) => terminalViewOf(tab) === entry[0]).length,
          path: (worktree ?? project)?.path ?? null,
        }
      }),
    ]
  })
}

export function groupName(
  project: MachineProject | undefined,
  worktree: MachineWorktree | null | undefined
) {
  if (project === undefined) {
    return 'Removed project'
  }
  if (worktree === null) {
    return project.name
  }
  if (worktree === undefined) {
    return `${project.name} · Removed worktree`
  }
  return `${project.name} · ${worktreeBranch(worktree)}`
}

export function alerted(group: Group, machine: string | null) {
  const state = getState()
  return (
    group.machine.id === machine &&
    state.layout.tabs.some(
      (tab) =>
        terminalViewOf(tab) === group.view && state.alerts.includes(tab.id)
    )
  )
}

export function GroupIcon(props: { group: Group }) {
  if (props.group.place.projectId === null) {
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
      projectId={props.group.place.projectId}
      className="size-4 shrink-0"
    />
  )
}

export function GroupCount(props: {
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
          : 'text-foreground/75 bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))]',
        props.className
      )}
    >
      {props.count}
    </span>
  )
}
