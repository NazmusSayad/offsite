import { Add01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useProjectName } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import { DesktopGroupedSessionItem } from '@/features/sidebar/desktop-grouped-session-item'
import { MobileGroupedSessionItem } from '@/features/sidebar/mobile-grouped-session-item'
import {
  chatKey,
  chatSelected,
  chatSelection,
  chatSessionId,
} from '@/lib/outbox'
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
  ordered: MachineSession[]
  mobile: boolean
}) {
  const name = useProjectName(props.machine, props.projectId)
  const machineIcon = useStore((state) => machineOf(state, props.machine).icon)
  const selection = useStore((state) => state.selection)
  const machines = useStore((state) => state.machines)

  return (
    <>
      <li className="text-sidebar-muted-foreground/60 mx-0.5 mt-2 flex h-7 items-center gap-2 pl-2 text-xs font-medium first:mt-0">
        <MachineLogo icon={machineIcon} className="size-3.5 shrink-0" />
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
          onClick={() =>
            openSession({
              machine: props.machine,
              projectId: props.projectId,
              worktreeId: null,
              sessionId: null,
              pending: null,
            })
          }
        >
          <HugeiconsIcon
            icon={Add01Icon}
            className="size-4 text-(--sidebar-icon-color)"
          />
        </button>
      </li>
      {props.sessions.map((session) => {
        const item = {
          session,
          selected: chatSelected(selection, session),
          activity: activityOf(machines, session.machine, session.id),
          unseen: session.unread,
          saved: chatSessionId(session.id) !== null,
          onSelect: () => openSession(chatSelection(session)),
        }
        const index = props.ordered.indexOf(session)
        return props.mobile ? (
          <MobileGroupedSessionItem key={chatKey(session)} {...item} />
        ) : (
          <DesktopGroupedSessionItem
            key={chatKey(session)}
            {...item}
            hotkey={index >= 0 && index < 9 ? String(index + 1) : null}
          />
        )
      })}
    </>
  )
}
