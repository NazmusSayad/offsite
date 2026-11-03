import { Settings01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Reorder } from 'motion/react'
import { useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { reorderProjects, updateProject } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { EditProjectDialog } from '@/features/sidebar/project-dialogs'
import { type MachineProject, showError, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ReorderRow } from './machines'

export function ProjectsPage(props: { machine: string; homeDir: string }) {
  const registered = useStore((state) => state.projects)
  const [order, setOrder] = useState<string[] | null>(null)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [scope, setScope] = useLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope', null)
  const projects = registered
    .filter((project) => project.machine === props.machine && !project.scratch)
    .sort((a, b) =>
      order === null ? 0 : order.indexOf(a.id) - order.indexOf(b.id)
    )

  return (
    <>
      {projects.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No projects yet
        </p>
      )}
      <Reorder.Group
        as="div"
        axis="y"
        values={projects.map((project) => project.id)}
        onReorder={setOrder}
      >
        {projects.map((project) => (
          <ReorderRow
            key={project.id}
            value={project.id}
            disabled={false}
            className="min-h-13 px-1 outline-none"
            onDragEnd={async () => {
              if (order === null) {
                return
              }
              try {
                await reorderProjects(props.machine, order)
              } catch (error) {
                showError(error)
              }
              setOrder(null)
            }}
          >
            <ProjectIcon
              machine={project.machine}
              projectId={project.id}
              className="size-5 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
            />
            <span className="min-w-0 flex-1" title={project.path}>
              <span
                className={cn(
                  'block truncate text-sm',
                  project.hidden && 'text-muted-foreground'
                )}
              >
                {project.name}
              </span>
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
            <Switch
              size="sm"
              checked={!project.hidden}
              onCheckedChange={(shown) =>
                updateProject(project.machine, project.id, {
                  hidden: !shown,
                }).catch(showError)
              }
              aria-label={`Show ${project.name}`}
            />
          </ReorderRow>
        ))}
      </Reorder.Group>
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

function homePath(path: string, home: string) {
  if (path === home) {
    return '~'
  }
  if (path.startsWith(`${home}/`) || path.startsWith(`${home}\\`)) {
    return `~${path.slice(home.length)}`
  }
  return path
}
