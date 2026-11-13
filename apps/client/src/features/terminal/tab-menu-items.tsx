import {
  Delete02Icon,
  Folder01Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import { type TerminalTab } from '@offsite/core/terminal'
import { rankProjects, worktreeBranch } from '@/api/projects'
import { MoreProjectsLabel, ProjectIcon } from '@/components/icons'
import {
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { type MachineProject, useStore } from '@/lib/store'
import { closeTab } from './close-tab'
import { send, terminalMachine } from './session'

export function TabMenuItems(props: {
  tab: TerminalTab
  onRename: () => void
}) {
  const allProjects = useStore((state) => state.projects)
  const own = allProjects.filter(
    (project) => project.machine === terminalMachine() && !project.scratch
  )
  const ranked = rankProjects(
    own.filter((project) => project.parentId === null)
  )
  const tab = props.tab

  function projectItem(root: MachineProject) {
    const worktrees = own.filter((project) => project.parentId === root.id)
    if (worktrees.length === 0) {
      return (
        <ContextMenuRadioItem key={root.id} value={root.id}>
          <ProjectIcon
            machine={root.machine}
            projectId={root.id}
            className="size-4"
          />
          <span className="max-w-60 truncate">{root.name}</span>
        </ContextMenuRadioItem>
      )
    }
    return (
      <ContextMenuSub key={root.id}>
        <ContextMenuSubTrigger>
          <ProjectIcon
            machine={root.machine}
            projectId={root.id}
            className="size-4"
          />
          <span className="max-w-60 truncate">{root.name}</span>
          <span className="text-muted-foreground flex items-center gap-0.5 text-xs tabular-nums">
            <HugeiconsIcon icon={WorktreeIcon} className="size-3.5" />
            {worktrees.length}
          </span>
        </ContextMenuSubTrigger>
        <ContextMenuPortal>
          <ContextMenuSubContent className="max-h-80 overflow-y-auto">
            <ContextMenuRadioItem value={root.id}>
              <ProjectIcon
                machine={root.machine}
                projectId={root.id}
                className="size-4"
              />
              <span className="max-w-60 truncate">{root.name}</span>
            </ContextMenuRadioItem>
            <ContextMenuSeparator />
            {worktrees.map((project) => (
              <ContextMenuRadioItem key={project.id} value={project.id}>
                <HugeiconsIcon
                  icon={WorktreeIcon}
                  className="text-muted-foreground size-3.5"
                />
                <span className="max-w-60 truncate">
                  {worktreeBranch(project)}
                </span>
              </ContextMenuRadioItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuPortal>
      </ContextMenuSub>
    )
  }

  return (
    <>
      <ContextMenuItem onSelect={props.onRename}>
        <HugeiconsIcon icon={PencilEdit02Icon} />
        Rename
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <HugeiconsIcon icon={Folder01Icon} />
          Move to
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-80 overflow-y-auto">
          <ContextMenuRadioGroup
            value={tab.projectId ?? ''}
            onValueChange={(value) =>
              send({
                type: 'assignTab',
                id: tab.id,
                projectId: value === '' ? null : value,
              })
            }
          >
            <ContextMenuRadioItem value="">No project</ContextMenuRadioItem>
            {ranked.top.length > 0 && <ContextMenuSeparator />}
            {ranked.top.map(projectItem)}
            {ranked.more.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger title="More projects">
                  <MoreProjectsLabel
                    projects={ranked.more}
                    className="size-4"
                  />
                </ContextMenuSubTrigger>
                <ContextMenuPortal>
                  <ContextMenuSubContent className="max-h-80 overflow-y-auto">
                    {ranked.more.map(projectItem)}
                  </ContextMenuSubContent>
                </ContextMenuPortal>
              </ContextMenuSub>
            )}
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => void closeTab(tab.id)}
      >
        <HugeiconsIcon icon={Delete02Icon} />
        Close tab
      </ContextMenuItem>
    </>
  )
}
