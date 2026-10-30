import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment } from 'react'
import { machineKey } from '@/api/machines'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
                {machines
                  .map((machine) => ({
                    machine,
                    items: projects.filter(
                      (item) => item.machine === machine.id
                    ),
                  }))
                  .filter((group) => group.items.length > 0)
                  .map(({ machine, items }, index) => (
                    <Fragment key={machine.id}>
                      {index > 0 && <DropdownMenuSeparator />}
                      {machines.length > 1 && (
                        <DropdownMenuLabel className="text-2xs flex items-center gap-1">
                          <HugeiconsIcon
                            icon={machineIcons[machine.icon]}
                            className="size-3 shrink-0"
                          />
                          <span className="truncate">{machine.name}</span>
                        </DropdownMenuLabel>
                      )}
                      {items.map((item) => (
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
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </Fragment>
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
