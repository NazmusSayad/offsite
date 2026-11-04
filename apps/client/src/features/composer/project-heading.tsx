import { NO_PROJECT } from '@offsite/core/projects'
import { Fragment, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { machineKey } from '@/api/machines'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { openSession } from '@/lib/sessions'
import { projectOf, useStore } from '@/lib/store'
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
  useHotkeys(
    ['mod+p', 'mod+semicolon'],
    (event) => {
      event.stopPropagation()
      setPicking(!picking)
    },
    {
      enabled: sessionId === null,
      enableOnFormTags: true,
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
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-80 w-64"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                props.onCloseMenu()
              }}
            >
              <ProjectMenu
                machine={props.machine}
                projectId={props.projectId}
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
    </div>
  )
}

function ProjectMenu(props: { machine: string; projectId: string }) {
  const projects = useStore((state) => state.projects)
  const machines = useStore((state) => state.machines)

  return (
    <DropdownMenuRadioGroup value={machineKey(props.machine, props.projectId)}>
      {machines
        .map((machine) => ({
          machine,
          items: projects.filter(
            (item) =>
              item.machine === machine.id && !item.hidden && !item.scratch
          ),
        }))
        .filter(
          (group) =>
            group.items.length > 0 ||
            group.machine.system?.scratchAvailable === true
        )
        .map((group, index) => (
          <Fragment key={group.machine.id}>
            {index > 0 && <DropdownMenuSeparator />}
            {machines.length > 1 && (
              <div className="flex items-center">
                <DropdownMenuLabel className="text-2xs flex min-w-0 flex-1 items-center gap-1">
                  <MachineLogo
                    icon={group.machine.icon}
                    className="size-3 shrink-0"
                  />
                  <span className="truncate">{group.machine.name}</span>
                </DropdownMenuLabel>
                {group.machine.system?.scratchAvailable === true && (
                  <DropdownMenuRadioItem
                    value={machineKey(group.machine.id, NO_PROJECT)}
                    className="text-muted-foreground data-[state=checked]:bg-foreground/10 data-[state=checked]:text-foreground text-2xs mr-1 h-5 min-h-0 shrink-0 gap-1 px-1.5 py-0 *:data-[slot=dropdown-menu-radio-item-indicator]:hidden"
                    onSelect={() =>
                      openSession({
                        machine: group.machine.id,
                        projectId: NO_PROJECT,
                        sessionId: null,
                      })
                    }
                  >
                    <ProjectIcon
                      machine={group.machine.id}
                      projectId={NO_PROJECT}
                      className="size-3 shrink-0"
                    />
                    Chat
                  </DropdownMenuRadioItem>
                )}
              </div>
            )}
            {machines.length === 1 &&
              group.machine.system?.scratchAvailable === true && (
                <DropdownMenuRadioItem
                  value={machineKey(group.machine.id, NO_PROJECT)}
                  onSelect={() =>
                    openSession({
                      machine: group.machine.id,
                      projectId: NO_PROJECT,
                      sessionId: null,
                    })
                  }
                >
                  <ProjectIcon
                    machine={group.machine.id}
                    projectId={NO_PROJECT}
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">Chat</span>
                </DropdownMenuRadioItem>
              )}
            {group.items.map((item) => (
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
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </Fragment>
        ))}
    </DropdownMenuRadioGroup>
  )
}
