import {
  ChevronDownIcon,
  SearchIcon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { NO_PROJECT } from '@offsite/core/projects'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useLocalStorage } from 'usehooks-ts'
import { machineKey } from '@/api/machines'
import { BookmarksDialog } from '@/features/bookmarks/bookmarks-dialog'
import {
  DesktopDraftRow,
  DesktopSessionItem,
} from '@/features/sidebar/desktop-session-item'
import { MobileMenu } from '@/features/sidebar/mobile-menu'
import {
  MobileDraftRow,
  MobileSessionItem,
} from '@/features/sidebar/mobile-session-item'
import {
  EditProjectDialog,
  FolderDialog,
} from '@/features/sidebar/project-dialogs'
import { ProjectGroup } from '@/features/sidebar/project-group'
import { ScopeMenu } from '@/features/sidebar/scope-menu'
import { ServiceBanners } from '@/features/sidebar/service-banner'
import { FittedStatusChips, StatusChips } from '@/features/sidebar/status-chips'
import { useInactiveSessions } from '@/features/sidebar/use-inactive-sessions'
import { CloseAllDialog } from '@/features/terminal/dialogs'
import { UsageDialog } from '@/features/usage/usage-dialog'
import { lastProject, openSession, startChat } from '@/lib/sessions'
import {
  activityOf,
  type MachineProject,
  type MachineSession,
  showPalette,
  showSettingsPage,
  threadState,
  useStore,
} from '@/lib/store'
import { cn, drag, mod } from '@/lib/utils'

const iconButton =
  'text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--control-radius)] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-(--sidebar-icon-color) hover:[&>svg]:text-sidebar-foreground'

const DONE_PAGE = 50

export function Sidebar(props: { className: string; mobile: boolean }) {
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const projects = useStore((state) => state.projects)
  const provider = useStore((state) => state.settings.provider)
  const unseen = useStore((state) => state.unseen)
  const loaded = useStore((state) => state.loaded)
  const inactive = useStore((state) => state.inactive)
  const inactiveTotal = useStore((state) => state.inactiveTotal)
  const groupActiveByProject = useStore(
    (state) => state.prefs.groupActiveByProject
  )
  const [scope, setScope] = useLocalStorage<{
    machine: string
    projectId: string
  } | null>('sidebarScope', null)
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<MachineProject | null>(null)
  const [snoozedOpen, setSnoozedOpen] = useState(false)
  const [minimizedOpen, setMinimizedOpen] = useState(false)
  const [inactiveOpen, setInactiveOpen] = useState(false)
  const [inactiveLimit, setInactiveLimit] = useState(DONE_PAGE)
  const [storedWidth, setWidth] = useLocalStorage('sidebarWidth', 256)
  const width = Math.max(256, storedWidth)
  const shown = sessions
    .filter(
      (session) =>
        scope === null ||
        (session.machine === scope.machine &&
          groupProject(session.machine, session.projectId) === scope.projectId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const snoozed = shown.filter(
    (session) =>
      session.status === 'snoozed' &&
      threadState(activityOf(machines, session.machine, session.id), false)
        .working
  )
  const active = [
    ...shown.filter((session) => session.status === 'pinned'),
    ...shown.filter(
      (session) =>
        session.status === 'active' ||
        (session.status === 'snoozed' && !snoozed.includes(session))
    ),
  ]
  const minimized = shown.filter((session) => session.status === 'minimized')
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
          claudeWorktree: false,
        }
      : null
  const draft =
    selection !== null && selection.sessionId === null ? selection : null
  const listed = started === null ? active : [started, ...active]
  const grouped = groupActiveByProject && scope === null
  const groups = [
    ...new Map(
      [...(draft === null ? [] : [draft]), ...listed].map((item) => {
        const projectId = groupProject(item.machine, item.projectId)
        return [
          machineKey(item.machine, projectId),
          { machine: item.machine, projectId },
        ]
      })
    ),
  ]

  const Draft = props.mobile ? MobileDraftRow : DesktopDraftRow

  function groupProject(machine: string, projectId: string) {
    const project = projects.find(
      (item) => item.machine === machine && item.id === projectId
    )
    return project?.scratch === true
      ? NO_PROJECT
      : (project?.parentId ?? projectId)
  }

  useInactiveSessions(inactiveOpen, scopeMachine, scopeProject, inactiveLimit)

  function startThread() {
    const target = scope ?? selection ?? lastProject()
    if (target !== null) {
      startChat(target.machine, target.projectId)
    } else if (machines.length > 0) {
      setAdding(machines[0].id)
    } else {
      showSettingsPage('Machines')
    }
  }

  useHotkeys(['mod+n', 'mod+t'], startThread, {
    enableOnFormTags: true,
    preventDefault: true,
  })

  useHotkeys(
    [
      'mod+1',
      'mod+2',
      'mod+3',
      'mod+4',
      'mod+5',
      'mod+6',
      'mod+7',
      'mod+8',
      'mod+9',
    ],
    (event) => {
      const ordered = grouped
        ? groups.flatMap((group) =>
            listed.filter(
              (session) =>
                machineKey(
                  session.machine,
                  groupProject(session.machine, session.projectId)
                ) === group[0]
            )
          )
        : listed
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
      if (digit === null) {
        throw new Error(`unexpected session shortcut key ${event.code}`)
      }
      const session = ordered[Number(digit[1]) - 1]
      if (session !== undefined) {
        select(session.machine, session.projectId, session.id)
      }
    },
    { enableOnFormTags: true, preventDefault: true, enabled: !props.mobile }
  )

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    const start = event.clientX - width
    drag(event, (next) => {
      const value = Math.min(480, Math.max(256, next.clientX - start))
      setWidth(value)
    })
  }

  function row(session: MachineSession) {
    const Item = props.mobile ? MobileSessionItem : DesktopSessionItem
    return (
      <Item
        key={machineKey(session.machine, session.id)}
        session={session}
        selected={
          selection?.machine === session.machine &&
          selection.sessionId === session.id
        }
        activity={activityOf(machines, session.machine, session.id)}
        unseen={unseen.includes(machineKey(session.machine, session.id))}
        saved={session !== started}
        scope={scope}
        onSelect={select}
      />
    )
  }

  function section(options: {
    label: string
    items: MachineSession[]
    open: boolean
    onToggle: () => void
    first: boolean
  }) {
    return (
      <>
        <li className={cn('mx-0.5 h-8 shrink-0', options.first && 'mt-auto')}>
          <button
            aria-expanded={options.open}
            className={cn(
              'flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs',
              options.open
                ? 'text-sidebar-foreground font-semibold'
                : 'text-sidebar-muted-foreground/60 font-medium'
            )}
            onClick={options.onToggle}
          >
            <span className="shrink-0">{options.label}</span>
            <span
              className={cn(
                'h-px min-w-2 flex-1',
                options.open
                  ? 'bg-sidebar-foreground/25'
                  : 'bg-sidebar-border/60'
              )}
            />
            <HugeiconsIcon
              icon={ChevronDownIcon}
              className={cn(
                'size-3 shrink-0 transition-transform',
                !options.open && 'rotate-180'
              )}
            />
          </button>
        </li>
        {options.open && options.items.map((session) => row(session))}
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
          <MobileMenu buttonClassName={iconButton} />
          <ScopeMenu
            scope={scope}
            onScope={(next) => {
              setScope(next)
              if (next !== null && selection?.sessionId === null) {
                select(next.machine, next.projectId, null)
              }
            }}
            onEdit={setEditing}
            onAddProject={setAdding}
          />
          {props.mobile && <StatusChips hideDone />}
          {!props.mobile && <FittedStatusChips />}
          <div className="ml-auto flex items-center gap-0.75">
            <button
              className={cn(iconButton, 'size-7 [&>svg]:size-4.5')}
              title={`Search (${mod}+K)`}
              aria-label="Search"
              onClick={() => showPalette(true)}
            >
              <HugeiconsIcon icon={SearchIcon} />
            </button>
            <button
              className={cn(iconButton, 'size-7 [&>svg]:size-4.5')}
              title={`New thread (${mod}+N)`}
              onClick={startThread}
            >
              <HugeiconsIcon icon={SquarePenIcon} />
            </button>
          </div>
        </div>
        <nav className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col overflow-y-auto px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
          <ul className="flex flex-1 flex-col gap-px">
            {grouped ? (
              groups.map(([key, group]) => (
                <ProjectGroup
                  key={key}
                  machine={group.machine}
                  projectId={group.projectId}
                  sessions={listed.filter(
                    (session) =>
                      machineKey(
                        session.machine,
                        groupProject(session.machine, session.projectId)
                      ) === key
                  )}
                  started={started}
                  mobile={props.mobile}
                />
              ))
            ) : (
              <>
                {draft !== null && (
                  <Draft
                    machine={draft.machine}
                    projectId={draft.projectId}
                    onSelect={() =>
                      select(draft.machine, draft.projectId, null)
                    }
                  />
                )}
                {listed.map((session) => row(session))}
              </>
            )}
            {active.length === 0 &&
              started === null &&
              selection?.sessionId !== null && (
                <li className="text-sidebar-muted-foreground/60 px-2.5 py-6 text-center text-xs">
                  No threads yet
                </li>
              )}
            {snoozed.length > 0 &&
              section({
                label: snoozedOpen ? 'Snoozed' : `Snoozed (${snoozed.length})`,
                items: snoozed,
                open: snoozedOpen,
                onToggle: () => setSnoozedOpen(!snoozedOpen),
                first: true,
              })}
            {minimized.length > 0 &&
              section({
                label: minimizedOpen
                  ? 'Minimized'
                  : `Minimized (${minimized.length})`,
                items: minimized,
                open: minimizedOpen,
                onToggle: () => setMinimizedOpen(!minimizedOpen),
                first: snoozed.length === 0,
              })}
            {section({
              label: 'Done',
              items: inactive.slice(0, inactiveLimit),
              open: inactiveOpen,
              onToggle: () => {
                setInactiveOpen(!inactiveOpen)
                setInactiveLimit(DONE_PAGE)
              },
              first: snoozed.length === 0 && minimized.length === 0,
            })}
            {inactiveOpen &&
              inactiveTotal > inactiveLimit &&
              inactive.length >= inactiveLimit && (
                <li
                  aria-hidden
                  className="h-px shrink-0"
                  ref={(element) => {
                    if (element === null) {
                      return
                    }
                    const observer = new IntersectionObserver((entries) => {
                      if (entries[0].isIntersecting) {
                        setInactiveLimit(inactiveLimit + DONE_PAGE)
                      }
                    })
                    observer.observe(element)
                    return () => observer.disconnect()
                  }}
                />
              )}
          </ul>
        </nav>
        <ServiceBanners />
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
      <UsageDialog />
      <CloseAllDialog />
      <BookmarksDialog />
      {adding !== null && (
        <FolderDialog
          machine={adding}
          onClose={() => setAdding(null)}
          onAdd={(project) => {
            setAdding(null)
            select(project.machine, project.id, null)
          }}
        />
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

function select(machine: string, projectId: string, sessionId: string | null) {
  openSession({ machine, projectId, sessionId })
}
