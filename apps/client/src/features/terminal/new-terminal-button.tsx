import { ProjectIcon } from '@/components/icons'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { useStore } from '@/lib/store'
import { createTab } from './page'

export function NewTerminalItems(props: { contextMenu?: boolean }) {
  const machines = useStore((store) => store.machines)
  const projects = useStore((store) => store.projects)
  const Item = props.contextMenu ? ContextMenuItem : DropdownMenuItem

  return machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) => [
      <Item key={machine.id} onSelect={() => void createTab(machine.id, null)}>
        <MachineLogo icon={machine.icon} />
        <span className="max-w-60 truncate">{machine.name}</span>
      </Item>,
      ...projects
        .filter(
          (project) =>
            project.machine === machine.id &&
            !project.hidden &&
            !project.scratch &&
            project.parentId === null
        )
        .map((project) => (
          <Item
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
          </Item>
        )),
    ])
}
