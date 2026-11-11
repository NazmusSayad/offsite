import { PinIcon, Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { homePath, rankProjects, updateProject } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  EditProjectDialog,
  FolderDialog,
} from '@/features/sidebar/project-dialogs'
import { type MachineProject, showError, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ProjectsPage(props: { machine: string; homeDir: string }) {
  const registered = useStore((state) => state.projects)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [adding, setAdding] = useState(false)
  const [scope, setScope] = useLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope', null)
  const ranked = rankProjects(
    registered.filter(
      (project) =>
        project.machine === props.machine &&
        !project.scratch &&
        project.parentId === null
    )
  )
  const projects = [...ranked.top, ...ranked.more]

  return (
    <>
      {projects.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No projects yet
        </p>
      )}
      <div>
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex min-h-13 items-center gap-3 px-1 py-2.5"
          >
            <ProjectIcon
              machine={project.machine}
              projectId={project.id}
              className="size-5 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
            />
            <span className="min-w-0 flex-1" title={project.path}>
              <span className="block truncate text-sm">{project.name}</span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {homePath(project.path, props.homeDir)}
              </span>
            </span>
            <Button
              size="icon-sm"
              variant="ghost-muted"
              title="Configure project"
              aria-label={`Configure ${project.name}`}
              onClick={() => setEditing(project)}
            >
              <HugeiconsIcon icon={Settings01Icon} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost-muted"
              className={cn(project.pinned && 'bg-accent text-foreground')}
              title={project.pinned ? 'Unpin project' : 'Pin project'}
              aria-label={
                project.pinned ? `Unpin ${project.name}` : `Pin ${project.name}`
              }
              aria-pressed={project.pinned}
              onClick={() =>
                updateProject(project.machine, project.id, {
                  pinned: !project.pinned,
                }).catch(showError)
              }
            >
              <HugeiconsIcon icon={PinIcon} />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          Add project…
        </Button>
      </div>
      {adding && (
        <FolderDialog
          machine={props.machine}
          onClose={() => setAdding(false)}
          onAdd={() => setAdding(false)}
        />
      )}
      {editing !== null && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(null)}
          onRemoved={() => {
            if (
              scope?.machine === editing.machine &&
              scope.projectId === editing.id
            ) {
              setScope(null)
            }
            setEditing(null)
          }}
        />
      )}
    </>
  )
}
