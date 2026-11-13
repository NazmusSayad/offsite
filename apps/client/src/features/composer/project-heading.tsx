import { NO_PROJECT } from '@offsite/core/projects'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyHint } from '@/components/hotkey-hint'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  EditProjectDialog,
  FolderDialog,
} from '@/features/sidebar/project-dialogs'
import { ProjectMenuItems } from '@/features/sidebar/scope-menu'
import { openSession } from '@/lib/sessions'
import { type MachineProject, projectOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ProjectHeading(props: {
  machine: string
  projectId: string
  onCloseMenu: () => void
}) {
  const sessionId = useStore((state) => state.selection?.sessionId)
  const project = useStore((state) =>
    projectOf(state, props.machine, props.projectId)
  )
  const projectless =
    props.projectId === NO_PROJECT || project?.scratch === true
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  useHotkeys(
    'mod+semicolon',
    (event) => {
      event.stopPropagation()
      setPicking(!picking)
    },
    {
      enabled: sessionId === null,
      enableOnFormTags: true,
      enableOnContentEditable: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )

  return (
    <div className="absolute inset-x-0 bottom-full pb-4">
      <h1 className="text-foreground w-full text-center text-2xl font-normal tracking-tight sm:text-3xl">
        What should we build {!projectless && 'in '}
        {sessionId === null ? (
          <DropdownMenu open={picking} onOpenChange={setPicking}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'border-muted-foreground/35 hover:border-foreground/60 inline-flex max-w-64 cursor-pointer border-b border-dotted align-bottom outline-none',
                  projectless && 'max-w-none'
                )}
                title={project?.path}
              >
                <span className="min-w-0 truncate">
                  {projectless ? 'without a project' : project?.name}
                </span>
                ?
                <HotkeyHint keyName=";" placement="above" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="flex max-h-80 w-64 flex-col overflow-hidden p-0"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                props.onCloseMenu()
              }}
            >
              <ProjectMenuItems
                inbox={false}
                scope={{ machine: props.machine, projectId: props.projectId }}
                onScope={(scope) => {
                  if (scope === null) {
                    throw new Error('the new thread menu has no inbox')
                  }
                  openSession({ ...scope, sessionId: null, pending: null })
                }}
                onEdit={setEditing}
                onAddProject={setAdding}
                onClose={() => setPicking(false)}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className={cn(
              'border-muted-foreground/35 inline-block max-w-64 truncate border-b border-dotted align-bottom',
              projectless && 'max-w-none'
            )}
            title={project?.path}
          >
            {projectless ? 'without a project' : project?.name}
          </span>
        )}
        {sessionId !== null && '?'}
      </h1>
      {adding !== null && (
        <FolderDialog
          machine={adding}
          onClose={() => setAdding(null)}
          onAdd={(project) => {
            setAdding(null)
            openSession({
              machine: project.machine,
              projectId: project.id,
              sessionId: null,
              pending: null,
            })
          }}
        />
      )}
      {editing !== null && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(null)}
          onRemoved={() => setEditing(null)}
        />
      )}
    </div>
  )
}
