import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { machineKey } from '@/api/machines'
import { useProjectName } from '@/api/projects'
import { machineIcons, ProjectIcon } from '@/components/icons'
import {
  DesktopGroupedDraftRow,
  DesktopGroupedSessionItem,
} from '@/features/sidebar/desktop-grouped-session-item'
import {
  MobileGroupedDraftRow,
  MobileGroupedSessionItem,
} from '@/features/sidebar/mobile-grouped-session-item'
import { openSession } from '@/lib/sessions'
import {
  activityOf,
  machineOf,
  type MachineSession,
  useStore,
} from '@/lib/store'

export function ProjectGroup(props: {
  machine: string
  projectId: string
  sessions: MachineSession[]
  started: MachineSession | null
  mobile: boolean
}) {
  const name = useProjectName(props.machine, props.projectId)
  const machineIcon = useStore(
    (state) => machineIcons[machineOf(state, props.machine).icon]
  )
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)
  const unseen = useStore((state) => state.unseen)
  const drafting =
    selection !== null &&
    selection.sessionId === null &&
    selection.machine === props.machine &&
    selection.projectId === props.projectId
  const Draft = props.mobile ? MobileGroupedDraftRow : DesktopGroupedDraftRow
  const Item = props.mobile
    ? MobileGroupedSessionItem
    : DesktopGroupedSessionItem

  function newThread() {
    openSession({
      machine: props.machine,
      projectId: props.projectId,
      sessionId: null,
    })
  }

  return (
    <>
      <li className="text-sidebar-muted-foreground/60 mx-0.5 mt-2 flex h-7 items-center gap-2 pl-2 text-xs font-medium first:mt-0">
        <HugeiconsIcon icon={machineIcon} className="size-3.5 shrink-0" />
        <span className="bg-sidebar-border/60 h-px min-w-2 flex-1" />
        <ProjectIcon
          machine={props.machine}
          projectId={props.projectId}
          className="size-3.5 shrink-0"
        />
        <span className="min-w-0 truncate">{name}</span>
        <span className="bg-sidebar-border/60 h-px min-w-2 flex-1" />
        <button
          className="text-sidebar-muted-foreground/80 hover:bg-sidebar-row-hover hover:text-sidebar-foreground flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--control-radius)]"
          title="New thread"
          aria-label="New thread"
          onClick={newThread}
        >
          <HugeiconsIcon
            icon={Add01Icon}
            className="size-4 text-(--sidebar-icon-color)"
          />
        </button>
      </li>
      {drafting && <Draft onSelect={newThread} />}
      {props.sessions.map((session) => (
        <Item
          key={machineKey(session.machine, session.id)}
          session={session}
          selected={
            selection?.machine === session.machine &&
            selection.sessionId === session.id
          }
          activity={activityOf(machines, session.machine, session.id)}
          unseen={unseen.includes(machineKey(session.machine, session.id))}
          saved={session !== props.started}
          onSelect={() =>
            openSession({
              machine: session.machine,
              projectId: session.projectId,
              sessionId: session.id,
            })
          }
        />
      ))}
    </>
  )
}
