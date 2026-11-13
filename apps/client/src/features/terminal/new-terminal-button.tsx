import { Add01Icon, GitBranchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { homePath, rankProjects, withWorktrees } from '@/api/projects'
import { MoreProjectsLabel, ProjectIcon } from '@/components/icons'
import {
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { type MachineProject, useStore } from '@/lib/store'
import { cn, touch } from '@/lib/utils'
import { useHoverMenu } from './hover-menu'
import { createTab } from './page'

export function NewTerminalItems(props: { contextMenu?: boolean }) {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)
  const menu = menuParts(props.contextMenu)

  return machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) => {
      const more = rankProjects(rootsOf(projects, machine.id)).more
      return [
        <menu.Item
          key={machine.id}
          onSelect={() => void createTab(machine.id, null)}
        >
          <MachineLogo icon={machine.icon} />
          <span className="max-w-60 truncate">{machine.name}</span>
        </menu.Item>,
        <ProjectItems
          key={`${machine.id}:top`}
          contextMenu={props.contextMenu}
          machine={machine.id}
          part="top"
        />,
        more.length > 0 && (
          <menu.Sub key={`${machine.id}:more`}>
            <menu.SubTrigger className="pl-7" title="More projects">
              <MoreProjectsLabel projects={more} className="size-4" />
            </menu.SubTrigger>
            <menu.Portal>
              <menu.SubContent className="max-h-80 overflow-y-auto">
                <ProjectItems
                  contextMenu={props.contextMenu}
                  machine={machine.id}
                  part="more"
                />
              </menu.SubContent>
            </menu.Portal>
          </menu.Sub>
        ),
      ]
    })
}

export function MoreTerminalProjects(props: { machine: string }) {
  const projects = useStore((store) => store.projects)
  const more = rankProjects(rootsOf(projects, props.machine)).more
  const hover = useHoverMenu()

  if (more.length === 0) {
    return null
  }
  return (
    <DropdownMenu {...hover.root}>
      <DropdownMenuTrigger asChild {...hover.area} {...hover.trigger}>
        <button
          className="hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent flex h-7 w-full shrink-0 cursor-pointer items-center gap-2 rounded-sm pr-2.5 pl-6 text-left text-[13px]"
          title="More projects"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreProjectsLabel projects={more} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={touch.matches ? 'bottom' : 'right'}
        className="max-h-80 overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
        {...hover.area}
      >
        <ProjectItems machine={props.machine} part="more" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectItems(props: {
  contextMenu?: boolean
  machine: string
  part: 'top' | 'more'
}) {
  const projects = useStore((store) => store.projects)
  const menu = menuParts(props.contextMenu)

  return rankProjects(rootsOf(projects, props.machine))[props.part].map(
    (project) =>
      projects.some(
        (item) => item.machine === props.machine && item.parentId === project.id
      ) ? (
        <menu.Sub key={project.id}>
          <menu.SubTrigger className={cn(props.part === 'top' && 'pl-7')}>
            <ProjectIcon
              machine={props.machine}
              projectId={project.id}
              className="size-4"
            />
            <span className="max-w-60 truncate">{project.name}</span>
            <span className="text-muted-foreground flex items-center gap-0.5 text-xs tabular-nums">
              <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" />
              {
                projects.filter(
                  (item) =>
                    item.machine === props.machine &&
                    item.parentId === project.id
                ).length
              }
            </span>
          </menu.SubTrigger>
          <menu.Portal>
            <menu.SubContent className="max-h-80 overflow-y-auto">
              <WorktreeItems
                contextMenu={props.contextMenu}
                machine={props.machine}
                rootId={project.id}
              />
            </menu.SubContent>
          </menu.Portal>
        </menu.Sub>
      ) : (
        <menu.Item
          key={project.id}
          className={cn(props.part === 'top' && 'pl-7')}
          onSelect={() => void createTab(props.machine, project.id)}
        >
          <ProjectIcon
            machine={props.machine}
            projectId={project.id}
            className="size-4"
          />
          <span className="max-w-60 truncate">{project.name}</span>
          {props.contextMenu !== true && (
            <HugeiconsIcon
              icon={Add01Icon}
              className="text-muted-foreground ml-auto hidden size-4 pointer-coarse:block"
            />
          )}
        </menu.Item>
      )
  )
}

function WorktreeItems(props: {
  contextMenu?: boolean
  machine: string
  rootId: string
}) {
  const projects = useStore((store) => store.projects)
  const menu = menuParts(props.contextMenu)
  const home = useStore(
    (store) =>
      store.machines.find((machine) => machine.id === props.machine)?.system
        ?.homeDir
  )

  return withWorktrees(
    projects.filter(
      (project) =>
        project.machine === props.machine &&
        (project.id === props.rootId || project.parentId === props.rootId)
    )
  ).map((project) => (
    <menu.Item
      key={project.id}
      title={project.path}
      onSelect={() => void createTab(props.machine, project.id)}
    >
      {project.parentId === null ? (
        <ProjectIcon
          machine={props.machine}
          projectId={project.id}
          className="size-4"
        />
      ) : (
        <HugeiconsIcon icon={GitBranchIcon} />
      )}
      <span className="max-w-80 truncate">
        {project.parentId === null
          ? project.name
          : home === undefined
            ? project.path
            : homePath(project.path, home)}
      </span>
    </menu.Item>
  ))
}

function rootsOf(projects: MachineProject[], machine: string) {
  return projects.filter(
    (project) =>
      project.machine === machine &&
      !project.hidden &&
      !project.scratch &&
      project.parentId === null
  )
}

function menuParts(contextMenu: boolean | undefined) {
  if (contextMenu === true) {
    return {
      Item: ContextMenuItem,
      Sub: ContextMenuSub,
      SubTrigger: ContextMenuSubTrigger,
      SubContent: ContextMenuSubContent,
      Portal: ContextMenuPortal,
    }
  }
  return {
    Item: DropdownMenuItem,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Portal: DropdownMenuPortal,
  }
}
