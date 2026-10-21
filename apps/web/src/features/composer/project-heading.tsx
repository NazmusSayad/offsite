import { machineKey } from '@/api/machines'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openSession } from '@/lib/sessions'
import { projectOf, useStore } from '@/lib/store'

export function ProjectHeading(props: {
  machine: string
  projectId: string
  onCloseMenu: () => void
}) {
  const sessionId = useStore((state) => state.selection?.sessionId)
  const project = useStore((state) =>
    projectOf(state, props.machine, props.projectId)
  )
  const projects = useStore((state) => state.projects)
  const machines = useStore((state) => state.machines)

  return (
    <div className="absolute inset-x-0 bottom-full pb-4">
      <h1 className="text-foreground w-full text-center text-2xl font-normal tracking-tight sm:text-3xl">
        What should we build in{' '}
        {sessionId === null ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="border-muted-foreground/35 hover:border-foreground/60 inline-flex max-w-64 cursor-pointer border-b border-dotted align-bottom outline-none"
                title={project?.path}
              >
                <span className="min-w-0 truncate">{project?.name}</span>?
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-80 w-64"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                props.onCloseMenu()
              }}
            >
              <DropdownMenuRadioGroup
                value={machineKey(props.machine, props.projectId)}
              >
                {[...projects]
                  .sort(
                    (a, b) =>
                      machines.findIndex((item) => item.id === a.machine) -
                      machines.findIndex((item) => item.id === b.machine)
                  )
                  .map((item) => (
                    <DropdownMenuRadioItem
                      key={machineKey(item.machine, item.id)}
                      value={machineKey(item.machine, item.id)}
                      title={item.path}
                      onSelect={() =>
                        openSession({
                          machine: item.machine,
                          projectId: item.id,
                          sessionId: null,
                        })
                      }
                    >
                      <ProjectIcon
                        machine={item.machine}
                        projectId={item.id}
                        className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                        {machines.length > 1 && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {
                              machines.find(
                                (other) => other.id === item.machine
                              )?.name
                            }
                          </span>
                        )}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span
            className="border-muted-foreground/35 inline-block max-w-64 truncate border-b border-dotted align-bottom"
            title={project?.path}
          >
            {project?.name}
          </span>
        )}
        {sessionId !== null && '?'}
      </h1>
    </div>
  )
}
