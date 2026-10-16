import {
  Add01Icon,
  ChevronDownIcon,
  InboxIcon,
  PencilEdit02Icon,
  PanelLeftCloseIcon,
  SearchIcon,
  Settings01Icon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Project, Session } from '@server/protocol'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { projectName } from '@/lib/format'
import { cn, drag, mod } from '@/lib/utils'
import { EditProjectDialog, FolderDialog } from '@/sidebar/project-dialogs'
import { DraftRow, SessionItem } from '@/sidebar/session-item'
import { openSession, showPalette, showSettings, useStore } from '@/store'

const iconButton =
  'text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--control-radius)] [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-(--sidebar-icon-color) hover:[&>svg]:text-sidebar-foreground'

export function Sidebar(props: {
  className: string
  onNavigate: () => void
  onHide: () => void
}) {
  const selection = useStore((state) => state.selection)
  const registered = useStore((state) => state.projects)
  const sessions = useStore((state) => state.sessions)
  const activity = useStore((state) => state.activity)
  const unseen = useStore((state) => state.unseen)
  const [scope, setScope] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [picking, setPicking] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [width, setWidth] = useState(
    Number(localStorage.getItem('sidebarWidth') ?? 240)
  )
  const projects = [...registered].sort((a, b) => a.name.localeCompare(b.name))
  const shown = sessions
    .filter((session) => scope === null || session.cwd === scope)
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
    )
  const attention = sessions.filter(
    (session) =>
      activity[session.id]?.running === true ||
      activity[session.id]?.waiting === true ||
      Object.values(activity[session.id]?.tasks ?? {}).includes('running') ||
      unseen.includes(session.id)
  )
  const active = shown.filter((session) => !session.archived)
  const archived = shown.filter((session) => session.archived)
  const started =
    selection !== null &&
    selection.sessionId !== null &&
    !sessions.some((session) => session.id === selection.sessionId)
      ? {
          id: selection.sessionId,
          title: 'New thread',
          cwd: selection.cwd,
          branch: null,
          updatedAt: Date.now(),
          pinned: false,
          archived: false,
        }
      : null

  function nameOf(cwd: string) {
    return (
      registered.find((project) => project.path === cwd)?.name ??
      projectName(cwd)
    )
  }

  function select(cwd: string, sessionId: string | null) {
    openSession({ cwd, sessionId })
    props.onNavigate()
  }

  function startThread() {
    const cwd = scope ?? selection?.cwd ?? null
    if (cwd === null) {
      setAdding(true)
      return
    }
    select(cwd, null)
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

  function row(session: Session, slim: boolean) {
    return (
      <SessionItem
        key={session.id}
        session={session}
        slim={slim}
        selected={selection?.sessionId === session.id}
        activity={activity[session.id]}
        unseen={unseen.includes(session.id)}
        saved={session !== started}
        onSelect={() => select(session.cwd, session.id)}
      />
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
                title={scope === null ? 'Inbox' : scope}
              >
                {scope === null ? (
                  <HugeiconsIcon
                    icon={InboxIcon}
                    className="size-4 shrink-0 text-(--sidebar-icon-color)"
                  />
                ) : (
                  <ProjectIcon
                    cwd={scope}
                    className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                  />
                )}
                <span className="truncate">
                  {scope === null ? 'Inbox' : nameOf(scope)}
                </span>
                <HugeiconsIcon
                  icon={ChevronDownIcon}
                  className="text-sidebar-muted-foreground size-3.5 shrink-0"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuRadioGroup value={scope ?? ''}>
                <DropdownMenuRadioItem value="" onSelect={() => setScope(null)}>
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
                    (session) => session.cwd === project.path
                  ).length
                  return (
                    <DropdownMenuRadioItem
                      key={project.path}
                      value={project.path}
                      title={project.path}
                      className="group/project"
                      onSelect={() => setScope(project.path)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setPicking(false)
                        setEditing(project)
                      }}
                    >
                      <ProjectIcon
                        cwd={project.path}
                        className="size-4 shrink-0 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                      </span>
                      {count > 0 && (
                        <span className="text-foreground grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                          {count}
                        </span>
                      )}
                      <button
                        className="text-muted-foreground hover:text-foreground hover:bg-foreground/10 -my-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm opacity-0 group-data-highlighted/project:opacity-100 [&_svg]:size-3.5"
                        title="Edit project"
                        aria-label={`Edit ${project.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setPicking(false)
                          setEditing(project)
                        }}
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} />
                      </button>
                    </DropdownMenuRadioItem>
                  )
                })}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAdding(true)}>
                <HugeiconsIcon icon={Add01Icon} />
                Add project…
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
                cwd={selection.cwd}
                onSelect={() => select(selection.cwd, null)}
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
            {archived.length > 0 && (
              <li className="mx-0.5 mt-auto h-8 pt-2">
                <button
                  aria-expanded={archivedOpen}
                  className="text-sidebar-muted-foreground/60 flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-xs font-medium"
                  onClick={() => setArchivedOpen(!archivedOpen)}
                >
                  <span className="shrink-0">
                    {archivedOpen
                      ? 'Archived'
                      : `Archived (${archived.length})`}
                  </span>
                  <span className="bg-sidebar-border/60 h-px min-w-2 flex-1" />
                  <HugeiconsIcon
                    icon={ChevronDownIcon}
                    className={cn(
                      'size-3 shrink-0 transition-transform',
                      !archivedOpen && 'rotate-180'
                    )}
                  />
                </button>
              </li>
            )}
            {archivedOpen && archived.map((session) => row(session, true))}
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
      {adding && (
        <FolderDialog
          onClose={() => setAdding(false)}
          onAdd={(project) => {
            setAdding(false)
            setScope(project.path)
            select(project.path, null)
          }}
        />
      )}
      {editing !== null && (
        <EditProjectDialog
          project={editing}
          onClose={() => setEditing(null)}
          onRemoved={() => {
            if (scope === editing.path) setScope(null)
            setEditing(null)
          }}
        />
      )}
    </aside>
  )
}
