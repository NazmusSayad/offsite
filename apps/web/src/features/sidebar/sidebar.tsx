import {
  ChevronDownIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  Settings01Icon,
  SquarePenIcon,
  SquareTerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocalStorage } from 'usehooks-ts'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
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
import { StatusChips } from '@/features/sidebar/status-chips'
import {
  lastTerminalMachine,
  openSession,
  openTerminalPage,
} from '@/lib/sessions'
import {
  activityOf,
  getState,
  type MachineProject,
  type MachineSession,
  showError,
  showPalette,
  showSettings,
  update,
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
  const loaded = useStore((state) => state.loaded)
  const inactive = useStore((state) => state.inactive)
  const inactiveVersion = useStore((state) => state.inactiveVersion)
  const [scope, setScope] = useLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope', null)
  const [adding, setAdding] = useState(false)
  const [addingMachine, setAddingMachine] = useState(false)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [snoozedOpen, setSnoozedOpen] = useState(false)
  const [minimizedOpen, setMinimizedOpen] = useState(false)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [filter, setFilter] = useState<ThreadFilter>('active')
  const [width, setWidth] = useLocalStorage('sidebarWidth', 240)
  const terminals = machines.reduce(
    (total, machine) => total + machine.terminals,
    0
  )
  const shown = sessions
    .filter(
      (session) =>
        scope === null ||
        (session.machine === scope.machine &&
          session.projectId === scope.projectId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const snoozed = shown.filter((session) => {
    const activity = activityOf(machines, session.machine, session.id)
    return (
      session.status === 'snoozed' &&
      activity?.waiting !== true &&
      (activity?.running === true ||
        Object.values(activity?.tasks ?? {}).includes('running'))
    )
  })
  const active = [
    ...shown.filter((session) => session.status === 'pinned'),
    ...shown.filter(
      (session) =>
        session.status === 'active' ||
        (session.status === 'snoozed' && !snoozed.includes(session))
    ),
  ]
  const minimized = shown.filter((session) => session.status === 'minimized')
  const lists = { snoozed, minimized, inactive }
  const showInactive = props.mobile ? filter === 'inactive' : inactiveOpen
  const scopeMachine = scope?.machine ?? null
  const scopeProject = scope?.projectId ?? null
  const started =
    selection !== null &&
    selection.sessionId !== null &&
    loaded &&
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

  const Draft = props.mobile ? MobileDraftRow : DesktopDraftRow

  useEffect(() => {
    if (!showInactive) {
      return
    }
    let current = true
    const targets =
      scopeMachine === null
        ? getState()
            .machines.filter((machine) => machine.status === 'online')
            .map((machine) => machine.id)
        : [scopeMachine]
    Promise.all(
      targets.map(async (machine) =>
        (
          await call(machine, 'sessions.inactive', {
            projectId: scopeProject,
          })
        ).map((session) => ({ ...session, machine }))
      )
    )
      .then((lists) => {
        if (current) {
          update({ inactive: lists.flat() })
        }
      })
      .catch(showError)
    return () => {
      current = false
    }
  }, [showInactive, scopeMachine, scopeProject, inactiveVersion])

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

  function openTerminal() {
    const machine = lastTerminalMachine()
    if (machine === null) {
      throw new Error('there is no machine to open a terminal on')
    }
    openTerminalPage(machine)
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
    return (
      <>
        <li className={cn('mx-0.5 h-9 pt-2', first && 'mt-auto')}>
          <button
            aria-expanded={open}
            className="text-sidebar-muted-foreground/60 flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs font-medium"
            onClick={onToggle}
          >
            <span className="shrink-0">{label}</span>
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
              onTerminal={openTerminal}
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
          {props.mobile && <StatusChips hideDone />}
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
            {props.mobile && filter !== 'active' && (
              <>
                {lists[filter].map((session) =>
                  row(session, filter === 'inactive')
                )}
                {lists[filter].length === 0 && (
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
                {snoozed.length > 0 &&
                  section(
                    snoozedOpen ? 'Snoozed' : `Snoozed (${snoozed.length})`,
                    snoozed,
                    snoozedOpen,
                    () => setSnoozedOpen(!snoozedOpen),
                    true
                  )}
                {minimized.length > 0 &&
                  section(
                    minimizedOpen
                      ? 'Minimized'
                      : `Minimized (${minimized.length})`,
                    minimized,
                    minimizedOpen,
                    () => setMinimizedOpen(!minimizedOpen),
                    snoozed.length === 0
                  )}
                {section(
                  'Inactive',
                  inactive,
                  inactiveOpen,
                  () => setInactiveOpen(!inactiveOpen),
                  snoozed.length === 0 && minimized.length === 0
                )}
              </>
            )}
          </ul>
        </nav>
        {!props.mobile && (
          <div className="border-sidebar-border @container flex shrink-0 flex-col gap-px border-t p-(--sidebar-content-inset)">
            {machines.length > 0 && (
              <button
                className={cn(
                  iconButton,
                  'h-8 justify-start gap-2 px-2.5 text-sm'
                )}
                title="Terminal"
                onClick={openTerminal}
              >
                <HugeiconsIcon icon={SquareTerminalIcon} />
                Terminal
                {terminals > 0 && (
                  <span className="text-foreground ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                    {terminals}
                  </span>
                )}
              </button>
            )}
            <div className="flex items-center gap-1">
              <button
                className={cn(
                  iconButton,
                  'h-8 flex-1 justify-start gap-2 px-2.5 text-sm'
                )}
                title="Settings"
                onClick={() => showSettings(true)}
              >
                <HugeiconsIcon icon={Settings01Icon} />
                <span className="hidden @min-[15rem]:inline">Settings</span>
              </button>
              <StatusChips hideDone={false} />
            </div>
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
