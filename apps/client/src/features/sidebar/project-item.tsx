import { PinIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { machineKey } from '@/api/machines'
import { rankProjects, updateProject } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'
import {
  type MachineProject,
  type MachineSession,
  showError,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

export function ProjectItem(props: {
  project: MachineProject
  attention: MachineSession[]
  onScope: (scope: { machine: string; projectId: string }) => void
  onEdit: (project: MachineProject) => void
  onClose: () => void
}) {
  const project = props.project
  const count = props.attention.filter(
    (session) =>
      session.machine === project.machine && session.projectId === project.id
  ).length

  return (
    <DropdownMenuRadioItem
      value={machineKey(project.machine, project.id)}
      title={project.path}
      data-project=""
      className="group/project"
      onSelect={() =>
        props.onScope({ machine: project.machine, projectId: project.id })
      }
      onContextMenu={(event) => {
        event.preventDefault()
        props.onClose()
        props.onEdit(project)
      }}
    >
      <span className="relative flex shrink-0">
        <ProjectIcon
          machine={project.machine}
          projectId={project.id}
          className="size-5 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
        />
        {count > 0 && (
          <span className="text-foreground border-popover absolute -right-1.5 -bottom-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full border bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-0.5 text-[9px] leading-none font-medium tabular-nums">
            {count}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      <div className="-my-0.5 flex shrink-0 items-center gap-0.5">
        <button
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-foreground/10 grid size-5 cursor-pointer place-items-center rounded-sm [&_svg]:size-3.5',
            !project.pinned &&
              'opacity-0 transition-opacity group-data-highlighted/project:opacity-100 pointer-coarse:hidden'
          )}
          title={project.pinned ? 'Unpin project' : 'Pin project'}
          aria-label={
            project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`
          }
          onClick={(event) => {
            event.stopPropagation()
            updateProject(project.machine, project.id, {
              pinned: !project.pinned,
            }).catch(showError)
          }}
        >
          <HugeiconsIcon icon={PinIcon} />
        </button>
        <button
          className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 grid size-5 cursor-pointer place-items-center rounded-sm opacity-0 transition-opacity group-data-highlighted/project:opacity-100 pointer-coarse:hidden [&_svg]:size-3.5"
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
}

export function MoreProjects(props: {
  machine: string
  attention: MachineSession[]
  onScope: (scope: { machine: string; projectId: string }) => void
  onEdit: (project: MachineProject) => void
  onClose: () => void
}) {
  const registered = useStore((state) => state.projects)
  const projects = rankProjects(
    registered.filter(
      (project) =>
        project.machine === props.machine &&
        !project.scratch &&
        project.parentId === null
    )
  ).more

  return projects.map((project) => (
    <ProjectItem
      key={machineKey(project.machine, project.id)}
      project={project}
      attention={props.attention}
      onScope={props.onScope}
      onEdit={props.onEdit}
      onClose={props.onClose}
    />
  ))
}
