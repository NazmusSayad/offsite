import { PinIcon, ZzzIcon, TickDouble01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import type { SessionActivity } from '@offsite/core/sessions'
import { memo, useRef, useState } from 'react'
import { useProjectName } from '@/api/projects'
import { ProjectIcon } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { timeAgo } from '@/lib/format'
import { deactivateSession, editSession } from '@/lib/sessions'
import {
  machineOf,
  type MachineSession,
  projectOf,
  threadState,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'
import { SessionTitle } from './session-title'
import { secondarySwipe } from './swipe-background'
import { SwipeRow } from './swipe-row'

const surface =
  'relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none touch-pan-y [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export const MobileSessionItem = memo(MobileSessionItemView)

function MobileSessionItemView(props: {
  session: MachineSession
  selected: boolean
  activity: SessionActivity | undefined
  unseen: boolean
  saved: boolean
  scope: { machine: string; projectId: string } | null
  onSelect: (machine: string, projectId: string, sessionId: string) => void
}) {
  const session = props.session
  const projectTitle = useProjectName(session.machine, session.projectId)
  const worktree = useStore(
    (state) =>
      (projectOf(state, session.machine, session.projectId)?.parentId ??
        null) !== null
  )
  const machineIcon = useStore(
    (state) => machineOf(state, session.machine).icon
  )
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const thread = threadState(props.activity, props.unseen)
  const recede = !props.selected && !thread.waiting && !thread.done

  function makeInactive() {
    void deactivateSession(session.machine, session.id, props.scope)
  }

  function deactivate() {
    if (thread.busy) {
      setWarning(true)
      return
    }
    makeInactive()
  }

  function complete(dx: number, status: MachineSession['status']) {
    if (dx > 0) {
      if (status === 'inactive') {
        void editSession(session.machine, session.id, { status: 'active' })
      } else {
        deactivate()
      }
    }
    if (dx < 0) {
      void editSession(session.machine, session.id, {
        status: secondarySwipe[status].status,
      })
    }
  }

  const stopDialog = (
    <AlertDialog open={warning} onOpenChange={setWarning}>
      <AlertDialogContent focus="action">
        <AlertDialogHeader>
          <AlertDialogTitle>Stop running work?</AlertDialogTitle>
          <AlertDialogDescription>
            This stops the agent and all background tasks, then marks the thread
            as done.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            icon={TickDouble01Icon}
            onClick={makeInactive}
          >
            Stop and Mark Done
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const menu = (
    <ContextMenuContent
      className="w-44"
      onCloseAutoFocus={(event) => {
        if (field.current === null) {
          return
        }
        event.preventDefault()
        field.current.focus()
        field.current.select()
      }}
    >
      <SessionMenuItems
        session={session}
        context={true}
        mobile={true}
        onDeactivate={deactivate}
        onDebug={null}
        onRename={() => setTitle(session.title)}
      />
    </ContextMenuContent>
  )

  const titleText =
    title === null ? (
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          recede ? 'text-foreground/85 font-normal' : 'font-medium',
          !recede && (props.unseen || thread.waiting) && 'text-foreground',
          !recede && !props.unseen && !thread.waiting && 'text-foreground/90'
        )}
      >
        <SessionTitle session={session} awaitingTitle={!props.saved} />
      </span>
    ) : (
      <form
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          const value = title.trim()
          setTitle(null)
          if (value !== '' && value !== session.title) {
            void editSession(session.machine, session.id, { title: value })
          }
        }}
      >
        <input
          ref={field}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => setTitle(null)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              setTitle(null)
            }
          }}
          className="text-foreground ring-ring/50 focus:ring-ring w-full rounded-sm bg-transparent text-sm font-medium ring-1 outline-none ring-inset"
        />
      </form>
    )

  const rowState = cn(
    props.selected && 'bg-sidebar-row-active text-sidebar-foreground',
    recede && 'text-sidebar-muted-foreground/75',
    !props.selected && !recede && 'text-sidebar-foreground bg-transparent'
  )

  return (
    <li className="list-none py-0.5">
      <SwipeRow
        status={session.status}
        enabled={props.saved}
        onSwipe={complete}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={!props.saved}>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                surface,
                rowState,
                thread.working &&
                  !props.selected &&
                  'opacity-70 in-data-swiping:opacity-100',
                'in-data-swiping:bg-sidebar'
              )}
              onClick={() =>
                props.onSelect(session.machine, session.projectId, session.id)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  props.onSelect(session.machine, session.projectId, session.id)
                }
              }}
            >
              <div className="px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
                <div className="flex h-6 min-w-0 items-center gap-2">
                  <ProjectIcon
                    machine={session.machine}
                    projectId={session.projectId}
                    className={cn(
                      'size-5',
                      session.status === 'inactive' && 'opacity-40 grayscale'
                    )}
                  />
                  {titleText}
                  <SessionStatus
                    session={session}
                    activity={props.activity}
                    done={thread.done}
                  />
                </div>
                <div className="text-secondary-label mt-1 flex h-5 min-w-0 items-center gap-1.5 text-xs">
                  <MachineLogo
                    icon={machineIcon}
                    className="size-3 shrink-0 opacity-70"
                  />
                  <span
                    className={cn(
                      'text-secondary-label/70 min-w-0 flex-1 truncate',
                      recede ? 'font-normal' : 'font-medium'
                    )}
                  >
                    {projectTitle}
                    {session.branch !== null && (
                      <span className="text-muted-foreground/40 font-normal">
                        {worktree ? (
                          <HugeiconsIcon
                            icon={WorktreeIcon}
                            className="mx-1 inline size-3 align-[-2px]"
                          />
                        ) : (
                          ' | '
                        )}
                        {session.branch}
                      </span>
                    )}
                  </span>
                  {session.status === 'pinned' && (
                    <HugeiconsIcon icon={PinIcon} className="size-3 shrink-0" />
                  )}
                  {session.status === 'snoozed' && (
                    <HugeiconsIcon icon={ZzzIcon} className="size-3 shrink-0" />
                  )}
                  <span className="shrink-0 tabular-nums">
                    {timeAgo(session.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          {menu}
        </ContextMenu>
      </SwipeRow>
      {stopDialog}
    </li>
  )
}
