import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { rankProjects, withWorktrees, worktreeBranch } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import { type Machine, type MachineProject, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { getState } from './session'

export type Group = {
  machine: Machine
  view: string
  name: string
  count: number
  parentId: string | null
}

export function useGroups(): Group[] {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)

  return machines.flatMap((machine) => {
    const tabs = machine.status === 'online' ? machine.terminals : []
    const tabProjects = tabs.flatMap((tab) =>
      tab.projectId === null ? [] : [tab.projectId]
    )
    const ranked = rankProjects(
      projects.filter(
        (project) =>
          machine.status === 'online' &&
          project.machine === machine.id &&
          !project.hidden &&
          !project.scratch &&
          project.parentId === null
      )
    )
    const projectIds = [
      ...new Set([
        ...withWorktrees([
          ...ranked.top,
          ...ranked.more.filter((root) =>
            projects.some(
              (project) =>
                project.machine === machine.id &&
                (project.id === root.id || project.parentId === root.id) &&
                tabProjects.includes(project.id)
            )
          ),
          ...projects.filter(
            (project) =>
              project.machine === machine.id &&
              !project.scratch &&
              project.parentId !== null
          ),
        ]).map((project) => project.id),
        ...tabProjects,
      ]),
    ]
    return [
      {
        machine,
        view: GLOBAL_TERMINALS,
        name: machine.name,
        count: tabs.filter((tab) => tab.projectId === null).length,
        parentId: null,
      },
      ...projectIds.map((projectId) => {
        const project = projects.find(
          (item) => item.machine === machine.id && item.id === projectId
        )
        return {
          machine,
          view: projectId,
          name: groupName(project),
          count: tabs.filter((tab) => tab.projectId === projectId).length,
          parentId: project?.parentId ?? null,
        }
      }),
    ]
  })
}

export function groupName(project: MachineProject | undefined) {
  if (project === undefined) {
    return 'Removed project'
  }
  const branch = worktreeBranch(project)
  return branch === null ? project.name : `${project.name} · ${branch}`
}

export function alerted(group: Group, machine: string | null) {
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

export function GroupIcon(props: { group: Group }) {
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
