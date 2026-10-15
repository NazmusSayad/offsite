import {
  Add01Icon,
  ChevronDownIcon,
  InboxIcon,
  PencilEdit02Icon,
  PanelLeftCloseIcon,
  SearchIcon,
  Settings01Icon,
  SquarePenIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Project, Session } from '@server/protocol'
import { useState } from 'react'
import { ProjectIcon } from '@/components/icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { projectName } from '@/lib/format'
import { cn, drag, mod } from '@/lib/utils'
import { EditProjectDialog, FolderDialog } from '@/sidebar/project-dialogs'
import { DraftRow, SessionItem } from '@/sidebar/session-item'
import { openSession, showSettings, useStore } from '@/store'

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
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [width, setWidth] = useState(
    Number(localStorage.getItem('sidebarWidth') ?? 240)
  )
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const projects = [...registered].sort((a, b) => a.name.localeCompare(b.name))
  const shown = sessions
    .filter((session) => scope === null || session.cwd === scope)
    .filter((session) => {
      const text = `${session.title} ${nameOf(session.cwd)}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
    )
  const attention = sessions.filter(
    (session) =>
      activity[session.id]?.running === true ||
      activity[session.id]?.waiting === true ||
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
      <div className="border-sidebar-border flex w-14 shrink-0 [scrollbar-width:none] flex-col items-center gap-1 overflow-y-auto border-r py-2">
        <button
          className={cn(
            'relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            scope === null && 'bg-accent text-foreground'
          )}
          title="Inbox"
          aria-label="Inbox"
          aria-current={scope === null}
          onClick={() => setScope(null)}
        >
          <HugeiconsIcon icon={InboxIcon} className="size-4.5" />
          {attention.length > 0 && (
            <span className="ring-sidebar text-foreground absolute right-0 bottom-0 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[9px] leading-none font-medium tabular-nums ring-2">
              {attention.length}
            </span>
          )}
        </button>
        {projects.map((project) => {
          const count = attention.filter(
            (session) => session.cwd === project.path
          ).length
          return (
            <ContextMenu key={project.path}>
              <ContextMenuTrigger asChild>
                <button
                  className={cn(
                    'relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    scope === project.path && 'bg-accent text-foreground'
                  )}
                  title={`${project.name}\n${project.path}`}
                  aria-label={project.name}
                  aria-current={scope === project.path}
                  onClick={() => setScope(project.path)}
                >
                  <ProjectIcon
                    cwd={project.path}
                    className="size-6 [&>img]:rounded-[6px] [&>svg]:rounded-[6px]"
                  />
                  {count > 0 && (
                    <span className="ring-sidebar text-foreground absolute right-0 bottom-0 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[9px] leading-none font-medium tabular-nums ring-2">
                      {count}
                    </span>
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem onSelect={() => setEditing(project)}>
                  <HugeiconsIcon icon={PencilEdit02Icon} />
                  Edit project
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-md text-[13px] font-medium transition-colors"
          title="Add project"
          aria-label="Add project"
          onClick={() => setAdding(true)}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4.5" />
        </button>
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground relative mt-auto flex size-10 flex-none cursor-pointer items-center justify-center rounded-md text-[13px] font-medium transition-colors"
          title={`Hide sidebar (${mod}+B)`}
          aria-label="Hide sidebar"
          onClick={props.onHide}
        >
          <HugeiconsIcon icon={PanelLeftCloseIcon} className="size-4.5" />
        </button>
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-md text-[13px] font-medium transition-colors"
          title="Settings"
          aria-label="Settings"
          onClick={() => showSettings(true)}
        >
          <HugeiconsIcon icon={Settings01Icon} className="size-4.5" />
        </button>
      </div>
      <div className="relative flex min-w-0 flex-col" style={{ width }}>
        <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 px-3">
          {scope === null ? (
            <span className="max-w-[45%] shrink-0 truncate text-sm font-medium">
              Inbox
            </span>
          ) : (
            <span
              className="max-w-[45%] shrink-0 truncate text-sm font-medium"
              title={scope}
            >
              {nameOf(scope)}
            </span>
          )}
          <label className="text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex h-8 min-w-0 flex-1 cursor-text items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium">
            <HugeiconsIcon
              icon={SearchIcon}
              className="size-4 shrink-0 text-(--sidebar-icon-color)"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('')
              }}
              placeholder="Search"
              className="text-sidebar-foreground placeholder:text-sidebar-muted-foreground min-w-0 flex-1 bg-transparent p-0 font-medium outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query !== '' && (
              <button
                className="hover:text-sidebar-foreground grid size-5 place-items-center rounded-sm"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <HugeiconsIcon icon={XIcon} className="size-3" />
              </button>
            )}
          </label>
          <button
            className={cn(iconButton, 'size-7')}
            title="New thread"
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
                  {words.length > 0 ? 'No matching threads' : 'No threads yet'}
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
