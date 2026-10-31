import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { useStore } from '@/lib/store'
import { createTab } from './page'

export function NewTerminalButton() {
  const machines = useStore((store) => store.machines)

  if (!machines.some((machine) => machine.status === 'online')) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="bg-sidebar-row-hover text-muted-foreground hover:text-foreground absolute top-1 right-1 grid size-6 cursor-pointer place-items-center rounded-md opacity-0 transition-opacity group-hover/terminal:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          aria-label="New terminal"
          title="New terminal"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        className="max-h-80 w-auto min-w-40 overflow-y-auto"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <NewTerminalItems />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewTerminalItems() {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)

  return machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) => [
      <DropdownMenuItem
        key={machine.id}
        onSelect={() => void createTab(machine.id, null)}
      >
        <MachineLogo icon={machine.icon} />
        <span className="max-w-60 truncate">{machine.name}</span>
      </DropdownMenuItem>,
      ...projects
        .filter((project) => project.machine === machine.id)
        .map((project) => (
          <DropdownMenuItem
            key={`${machine.id}:${project.id}`}
            className="pl-7"
            onSelect={() => void createTab(machine.id, project.id)}
          >
            <ProjectIcon
              machine={machine.id}
              projectId={project.id}
              className="size-4"
            />
            <span className="max-w-60 truncate">{project.name}</span>
          </DropdownMenuItem>
        )),
    ])
}
