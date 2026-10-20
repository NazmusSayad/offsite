import {
  AlertCircleIcon,
  ChevronDownIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  Settings01Icon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocalStorage } from 'usehooks-ts'
import { machineKey } from '@/api/machines'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DesktopDraftRow,
  DesktopSessionItem,
} from '@/features/sidebar/desktop-session-item'
import { AddMachineDialog } from '@/features/sidebar/machine-dialog'
import { MobileMenu, type ThreadFilter } from '@/features/sidebar/mobile-menu'
import {
  MobileDraftRow,
  MobileSessionItem,
} from '@/features/sidebar/mobile-session-item'
import {
  EditProjectDialog,
  FolderDialog,
} from '@/features/sidebar/project-dialogs'
import { ScopeMenu } from '@/features/sidebar/scope-menu'
import { openSession } from '@/lib/sessions'
import {
  activityOf,
  dismissError,
  type MachineProject,
  type MachineSession,
  showPalette,
  showSettings,
  useStore,
} from '@/lib/store'
import { cn, drag, mod } from '@/lib/utils'

const iconButton =
  'text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--control-radius)] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-(--sidebar-icon-color) hover:[&>svg]:text-sidebar-foreground'

export function Sidebar(
  props:
    | { className: string; mobile: false; onHide: () => void }
    | { className: string; mobile: true }
) {
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const projects = useStore((state) => state.projects)
  const provider = useStore((state) => state.settings.provider)
  const unseen = useStore((state) => state.unseen)
  const error = useStore((state) => state.error)
  const [scope, setScope] = useLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope', null)
  const [adding, setAdding] = useState(false)
  const [addingMachine, setAddingMachine] = useState(false)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [minimizedOpen, setMinimizedOpen] = useState(false)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [filter, setFilter] = useState<ThreadFilter>('active')
  const [width, setWidth] = useLocalStorage('sidebarWidth', 240)
  const shown = sessions
    .filter(
      (session) =>
        scope === null ||
        (session.machine === scope.machine &&
          session.projectId === scope.projectId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
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

  const errorButton = error !== null && (
    <Popover onOpenChange={(open) => !open && dismissError()}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            iconButton,
            '[&>svg]:text-error hover:[&>svg]:text-error ml-auto size-7'
          )}
          title="Error"
          aria-label="Error"
        >
          <HugeiconsIcon icon={AlertCircleIcon} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="text-error-foreground max-w-[min(20rem,calc(100vw-2rem))] p-3 text-sm whitespace-pre-wrap"
      >
        {error}
      </PopoverContent>
    </Popover>
  )

  const Draft = props.mobile ? MobileDraftRow : DesktopDraftRow

  const folderMachine =
    scope?.machine ?? selection?.machine ?? machines.at(0)?.id

  function select(
    machine: string,
    projectId: string,
    sessionId: string | null
  ) {
    openSession({ machine, projectId, sessionId })
  }

  function startThread() {
    const target = scope ?? selection ?? lastProject()
    if (target === null) {
      setAdding(true)
    } else {
      select(target.machine, target.projectId, null)
    }
  }

  function lastProject() {
    const raw = localStorage.getItem('lastProject')
    const last: { machine: string; projectId: string } | null =
      raw === null ? null : JSON.parse(raw)
    const registered =
      last === null
        ? undefined
        : projects.find(
            (project) =>
              project.machine === last.machine && project.id === last.projectId
          )
    const project = registered ?? projects.at(0)
    if (project === undefined) {
      return null
    }
    return { machine: project.machine, projectId: project.id }
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
    })
  }

  function row(session: MachineSession, slim: boolean) {
    const Item = props.mobile ? MobileSessionItem : DesktopSessionItem
    return (
      <Item
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
        scope={scope}
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
    if (items.length === 0) {
      return null
    }
    return (
      <>
        <li className={cn('mx-0.5 h-9 pt-2', first && 'mt-auto')}>
          <button
            aria-expanded={open}
            className="text-sidebar-muted-foreground/60 flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs font-medium"
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
        {open &&
          items.map((session) => row(session, session.status === 'inactive'))}
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
      <div
        className={cn(
          'relative flex min-w-0 flex-col',
          props.mobile && 'flex-1'
        )}
        style={props.mobile ? undefined : { width }}
      >
        <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 px-3">
          {props.mobile ? (
            <MobileMenu
              className={cn(iconButton, 'size-7')}
              filter={filter}
              onFilter={setFilter}
            />
          ) : (
            <button
              className={cn(iconButton, 'size-7')}
              title={`Hide sidebar (${mod}+B)`}
              aria-label="Hide sidebar"
              onClick={props.onHide}
            >
              <HugeiconsIcon icon={PanelLeftOpenIcon} />
            </button>
          )}
          <ScopeMenu
            scope={scope}
            onScope={setScope}
            onEdit={setEditing}
            onAddProject={() => setAdding(true)}
            onAddMachine={() => setAddingMachine(true)}
          />
          {props.mobile && errorButton}
          <button
            className={cn(
              iconButton,
              'size-7',
              (!props.mobile || error === null) && 'ml-auto'
            )}
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
            {props.mobile && filter !== 'active' && (
              <>
                {(filter === 'minimized' ? minimized : inactive).map(
                  (session) => row(session, filter === 'inactive')
                )}
                {(filter === 'minimized' ? minimized : inactive).length ===
                  0 && (
                  <li className="text-sidebar-muted-foreground/60 px-2.5 py-6 text-center text-xs">
                    No {filter} threads
                  </li>
                )}
              </>
            )}
            {(!props.mobile || filter === 'active') && (
              <>
                {selection !== null && selection.sessionId === null && (
                  <Draft
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
              </>
            )}
            {!props.mobile && (
              <>
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
              </>
            )}
          </ul>
        </nav>
        {!props.mobile && (
          <div className="border-sidebar-border flex shrink-0 items-center gap-1 border-t p-(--sidebar-content-inset)">
            <button
              className={cn(
                iconButton,
                'h-8 flex-1 justify-start gap-2 px-2.5 text-sm'
              )}
              title="Settings"
              onClick={() => showSettings(true)}
            >
              <HugeiconsIcon icon={Settings01Icon} />
              Settings
            </button>
            {errorButton}
          </div>
        )}
        {!props.mobile && (
          <div
            role="separator"
            aria-orientation="vertical"
            className="group absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize select-none"
            onPointerDown={resize}
          >
            <span className="group-hover:bg-border group-active:bg-primary/60 pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors" />
          </div>
        )}
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
            ) {
              setScope(null)
            }
            setEditing(null)
          }}
        />
      )}
    </aside>
  )
}
