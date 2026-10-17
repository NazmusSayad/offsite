import {
  Add01Icon,
  ChevronDownIcon,
  ComputerIcon,
  InboxIcon,
  PanelLeftCloseIcon,
  SearchIcon,
  Settings01Icon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { machineKey } from '@/api/machines'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AddMachineDialog } from '@/features/sidebar/machine-dialog'
import {
  EditProjectDialog,
  FolderDialog,
} from '@/features/sidebar/project-dialogs'
import { DraftRow, SessionItem } from '@/features/sidebar/session-item'
import {
  activityOf,
  type MachineProject,
  type MachineSession,
  openSession,
  showPalette,
  showSettings,
  useStore,
} from '@/lib/store'
import { cn, drag, mod } from '@/lib/utils'

const iconButton =
  'text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--control-radius)] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-(--sidebar-icon-color) hover:[&>svg]:text-sidebar-foreground'

export function Sidebar(props: {
  className: string
  onNavigate: () => void
  onHide: () => void
}) {
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)
  const registered = useStore((state) => state.projects)
  const sessions = useStore((state) => state.sessions)
  const provider = useStore((state) => state.settings.provider)
  const unseen = useStore((state) => state.unseen)
  const [scope, setScope] = useState<{
    machine: string
    projectId: string
  } | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingMachine, setAddingMachine] = useState(false)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [picking, setPicking] = useState(false)
  const [minimizedOpen, setMinimizedOpen] = useState(false)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [width, setWidth] = useState(
    Number(localStorage.getItem('sidebarWidth') ?? 240)
  )
  const projects = [...registered].sort(
    (a, b) =>
      machines.findIndex((item) => item.id === a.machine) -
        machines.findIndex((item) => item.id === b.machine) ||
      a.name.localeCompare(b.name)
  )
  const shown = sessions
    .filter(
      (session) =>
        scope === null ||
        (session.machine === scope.machine &&
          session.projectId === scope.projectId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const attention = sessions.filter((session) => {
    const activity = activityOf(machines, session.machine, session.id)
    return (
      activity?.running === true ||
      activity?.waiting === true ||
      Object.values(activity?.tasks ?? {}).includes('running') ||
      unseen.includes(machineKey(session.machine, session.id))
    )
  })
  const active = [
    ...shown.filter((session) => session.status === 'pinned'),
    ...shown.filter((session) => session.status === 'active'),
  ]
  const minimized = shown.filter((session) => session.status === 'minimized')
  const inactive = shown.filter((session) => session.status === 'inactive')
  const started =
    selection !== null &&
    selection.sessionId !== null &&
    !sessions.some(
      (session) =>
        session.machine === selection.machine &&
        session.id === selection.sessionId
    )
      ? {
          machine: selection.machine,
          id: selection.sessionId,
          provider,
          title: 'New thread',
          projectId: selection.projectId,
          branch: null,
          updatedAt: Date.now(),
          status: 'active' as const,
        }
      : null

  const folderMachine =
    scope?.machine ?? selection?.machine ?? machines.at(0)?.id

  function projectAt(machine: string, projectId: string) {
    return registered.find(
      (project) => project.machine === machine && project.id === projectId
    )
  }

  function machineLabel(id: string) {
    const machine = machines.find((item) => item.id === id)
    if (machine === undefined) return ''
    if (machine.status === 'online') return machine.name
    if (machine.status === 'outdated') return `${machine.name} · needs update`
    if (machine.status === 'newer') return `${machine.name} · reload page`
    if (machine.status === 'unauthorized')
      return `${machine.name} · needs pairing`
    if (machine.status === 'mismatch')
      return `${machine.name} · different machine`
    return `${machine.name} · offline`
  }

  function machineIcon(id: string) {
    const machine = machines.find((item) => item.id === id)
    if (machine === undefined) return null
    return (
      <HugeiconsIcon
        icon={machineIcons[machine.icon]}
        className="mr-1 inline size-3 align-[-2px]"
      />
    )
  }

  function select(
    machine: string,
    projectId: string,
    sessionId: string | null
  ) {
    openSession({ machine, projectId, sessionId })
    props.onNavigate()
  }

  function startThread() {
    if (scope !== null) {
      select(scope.machine, scope.projectId, null)
      return
    }
    if (selection !== null) {
      select(selection.machine, selection.projectId, null)
      return
    }
    setAdding(true)
  }

  useHotkeys(['mod+n', 'mod+t'], startThread, {
    enableOnFormTags: true,
    preventDefault: true,
  })

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    const start = event.clientX - width
    drag(event, (next) => {
      const value = Math.min(480, Math.max(200, next.clientX - start))
      setWidth(value)
      localStorage.setItem('sidebarWidth', String(value))
    })
  }

  function row(session: MachineSession, slim: boolean) {
    return (
      <SessionItem
        key={machineKey(session.machine, session.id)}
        session={session}
        slim={slim}
        selected={
          selection?.machine === session.machine &&
          selection.sessionId === session.id
        }
        activity={activityOf(machines, session.machine, session.id)}
        unseen={unseen.includes(machineKey(session.machine, session.id))}
        saved={session !== started}
        onSelect={() => select(session.machine, session.projectId, session.id)}
      />
    )
  }

  function section(
    label: string,
    items: MachineSession[],
    open: boolean,
    onToggle: () => void,
    first: boolean
  ) {
    if (items.length === 0) return null
    return (
      <>
        <li className={cn('mx-0.5 h-8 pt-2', first && 'mt-auto')}>
          <button
            aria-expanded={open}
            className="text-sidebar-muted-foreground/60 flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs font-medium"
            onClick={onToggle}
          >
            <span className="shrink-0">
              {open ? label : `${label} (${items.length})`}
            </span>
            <span className="bg-sidebar-border/60 h-px min-w-2 flex-1" />
            <HugeiconsIcon
              icon={ChevronDownIcon}
              className={cn(
                'size-3 shrink-0 transition-transform',
                !open && 'rotate-180'
              )}
            />
          </button>
        </li>
        {open && items.map((session) => row(session, true))}
      </>
    )
  }

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-none border-r select-none',
        props.className
      )}
    >
      <div className="relative flex min-w-0 flex-col" style={{ width }}>
        <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 px-3">
          <button
            className={cn(iconButton, 'size-7')}
            title={`Hide sidebar (${mod}+B)`}
            aria-label="Hide sidebar"
            onClick={props.onHide}
          >
            <HugeiconsIcon icon={PanelLeftCloseIcon} />
          </button>
          <DropdownMenu open={picking} onOpenChange={setPicking}>
            <DropdownMenuTrigger asChild>
              <button
                className="hover:bg-sidebar-row-hover data-[state=open]:bg-sidebar-row-hover -ml-1.5 flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-[var(--control-radius)] px-1.5 text-sm font-medium"
                title={
                  scope === null
                    ? 'Inbox'
                    : projectAt(scope.machine, scope.projectId)?.path
                }
              >
                {scope === null ? (
                  <HugeiconsIcon
                    icon={InboxIcon}
                    className="size-4 shrink-0 text-(--sidebar-icon-color)"
                  />
                ) : (
                  <ProjectIcon
                    machine={scope.machine}
                    projectId={scope.projectId}
                    className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                  />
                )}
                <span className="truncate">
                  {scope === null
                    ? 'Inbox'
                    : projectAt(scope.machine, scope.projectId)?.name}
                </span>
                <HugeiconsIcon
                  icon={ChevronDownIcon}
                  className="text-sidebar-muted-foreground size-3.5 shrink-0"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuRadioGroup
                value={
                  scope === null
                    ? ''
                    : machineKey(scope.machine, scope.projectId)
                }
              >
                <DropdownMenuRadioItem
                  value=""
                  className="pr-9 pl-8 *:data-[slot=dropdown-menu-radio-item-indicator]:right-auto *:data-[slot=dropdown-menu-radio-item-indicator]:left-2"
                  onSelect={() => setScope(null)}
                >
                  <HugeiconsIcon icon={InboxIcon} />
                  <span className="min-w-0 flex-1 truncate">Inbox</span>
                  {attention.length > 0 && (
                    <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                      {attention.length}
                    </span>
                  )}
                </DropdownMenuRadioItem>
                {projects.map((project) => {
                  const count = attention.filter(
                    (session) =>
                      session.machine === project.machine &&
                      session.projectId === project.id
                  ).length
                  return (
                    <DropdownMenuRadioItem
                      key={machineKey(project.machine, project.id)}
                      value={machineKey(project.machine, project.id)}
                      title={project.path}
                      className="pr-2 pl-8 *:data-[slot=dropdown-menu-radio-item-indicator]:right-auto *:data-[slot=dropdown-menu-radio-item-indicator]:left-2"
                      onSelect={() =>
                        setScope({
                          machine: project.machine,
                          projectId: project.id,
                        })
                      }
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setPicking(false)
                        setEditing(project)
                      }}
                    >
                      <ProjectIcon
                        machine={project.machine}
                        projectId={project.id}
                        className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                        {machines.length > 1 && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {machineIcon(project.machine)}
                            {machineLabel(project.machine)}
                          </span>
                        )}
                      </span>
                      {count > 0 && (
                        <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                          {count}
                        </span>
                      )}
                      <button
                        className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 -my-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm [&_svg]:size-3.5"
                        title="Configure project"
                        aria-label={`Configure ${project.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPicking(false)
                          setEditing(project)
                        }}
                      >
                        <HugeiconsIcon icon={Settings01Icon} />
                      </button>
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="pl-8"
                onSelect={() => setAdding(true)}
              >
                <HugeiconsIcon icon={Add01Icon} />
                Add project…
              </DropdownMenuItem>
              <DropdownMenuItem
                className="pl-8"
                onSelect={() => setAddingMachine(true)}
              >
                <HugeiconsIcon icon={ComputerIcon} />
                Add machine…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className={cn(iconButton, 'ml-auto size-7')}
            title={`Search (${mod}+K)`}
            aria-label="Search"
            onClick={() => showPalette(true)}
          >
            <HugeiconsIcon icon={SearchIcon} />
          </button>
          <button
            className={cn(iconButton, 'size-7')}
            title={`New thread (${mod}+N)`}
            onClick={startThread}
          >
            <HugeiconsIcon icon={SquarePenIcon} />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col overflow-y-auto px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
          <ul className="flex flex-1 flex-col gap-px">
            {selection !== null && selection.sessionId === null && (
              <DraftRow
                machine={selection.machine}
                projectId={selection.projectId}
                onSelect={() =>
                  select(selection.machine, selection.projectId, null)
                }
              />
            )}
            {started !== null && row(started, false)}
            {active.map((session) => row(session, false))}
            {active.length === 0 &&
              started === null &&
              selection?.sessionId !== null && (
                <li className="text-sidebar-muted-foreground/60 px-2.5 py-6 text-center text-xs">
                  No threads yet
                </li>
              )}
            {section(
              'Minimized',
              minimized,
              minimizedOpen,
              () => setMinimizedOpen(!minimizedOpen),
              true
            )}
            {section(
              'Inactive',
              inactive,
              inactiveOpen,
              () => setInactiveOpen(!inactiveOpen),
              minimized.length === 0
            )}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1 px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
          <button
            className={cn(iconButton, 'h-7 gap-2 px-2 text-sm')}
            title="Settings"
            onClick={() => showSettings(true)}
          >
            <HugeiconsIcon icon={Settings01Icon} />
            Settings
          </button>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          className="group absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize select-none md:block"
          onPointerDown={resize}
        >
          <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
        </div>
      </div>
      {adding && folderMachine === undefined && (
        <AddMachineDialog onClose={() => setAdding(false)} />
      )}
      {adding && folderMachine !== undefined && (
        <FolderDialog
          machine={folderMachine}
          onClose={() => setAdding(false)}
          onAdd={(project) => {
            setAdding(false)
            setScope({ machine: project.machine, projectId: project.id })
            select(project.machine, project.id, null)
          }}
        />
      )}
      {addingMachine && (
        <AddMachineDialog onClose={() => setAddingMachine(false)} />
      )}
      {editing !== null && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(null)}
          onRemoved={() => {
            if (
              scope?.machine === editing.machine &&
              scope.projectId === editing.id
            )
              setScope(null)
            setEditing(null)
          }}
        />
      )}
    </aside>
  )
}
