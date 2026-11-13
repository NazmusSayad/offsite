import { PinIcon, SquarePenIcon, ZzzIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
  threadState,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'
import { SessionTitle } from './session-title'
import {
  secondarySwipe,
  SwipeBackground,
  swipeThreshold,
} from './swipe-background'

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
  const machineIcon = useStore(
    (state) => machineOf(state, session.machine).icon
  )
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const [offset, setOffset] = useState(0)
  const [width, setWidth] = useState(0)
  const [released, setReleased] = useState<number | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const swipe = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const swiped = useRef(false)
  const thread = threadState(props.activity, props.unseen)
  const recede = !props.selected && !thread.waiting && !thread.done
  const moving = offset !== 0 || released !== null

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

  function release(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipe.current
    swipe.current = null
    if (start === null || !start.swiping) {
      setOffset(0)
      return
    }
    swiped.current = true
    const dx = event.clientX - start.x
    if (dx === 0) {
      setOffset(0)
      return
    }
    setReleased(dx)
    if (Math.abs(dx) > width * swipeThreshold) {
      setOffset(Math.sign(dx) * width)
      return
    }
    setOffset(0)
  }

  function settle(event: React.TransitionEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== 'transform' ||
      released === null
    ) {
      return
    }
    setReleased(null)
    setOffset(0)
    if (offset > 0) {
      if (session.status === 'inactive') {
        void editSession(session.machine, session.id, { status: 'active' })
      } else {
        deactivate()
      }
    }
    if (offset < 0) {
      void editSession(session.machine, session.id, {
        status: secondarySwipe[session.status].status,
      })
    }
  }

  const swipeHandlers = {
    onClick: () => {
      if (swiped.current) {
        swiped.current = false
        return
      }
      props.onSelect(session.machine, session.projectId, session.id)
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!props.saved || event.pointerType !== 'touch' || released !== null) {
        return
      }
      swiped.current = false
      setWidth(event.currentTarget.offsetWidth)
      swipe.current = {
        x: event.clientX,
        y: event.clientY,
        swiping: false,
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      const start = swipe.current
      if (start === null) {
        return
      }
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (!start.swiping && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        return
      }
      if (!start.swiping && Math.abs(dx) <= Math.abs(dy)) {
        swipe.current = null
        return
      }
      start.swiping = true
      setOffset(dx)
    },
    onPointerUp: release,
    onTransitionEnd: settle,
    onPointerCancel: () => {
      swipe.current = null
      setOffset(0)
    },
  }

  const swipeBackground = moving && (
    <SwipeBackground
      status={session.status}
      offset={released ?? offset}
      width={width}
      className="inset-x-0 inset-y-0.5"
    />
  )

  const stopDialog = (
    <AlertDialog open={warning} onOpenChange={setWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop running work?</AlertDialogTitle>
          <AlertDialogDescription>
            The agent or background tasks are running. Do you really want to
            stop them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={makeInactive}>
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
          recede ? 'text-foreground/70 font-normal' : 'font-medium',
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
    <li className="relative list-none py-0.5">
      {swipeBackground}
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!props.saved}>
          <div
            role="button"
            tabIndex={0}
            className={cn(
              surface,
              rowState,
              thread.working && !props.selected && !moving && 'opacity-70',
              moving && 'bg-sidebar',
              released !== null &&
                offset === 0 &&
                'transition-transform duration-[360ms] ease-[cubic-bezier(.34,1.45,.64,1)]',
              released !== null &&
                offset !== 0 &&
                'transition-transform duration-200 ease-in'
            )}
            style={
              moving ? { transform: `translateX(${offset}px)` } : undefined
            }
            {...swipeHandlers}
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
                      {` | ${session.branch}`}
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
      {stopDialog}
    </li>
  )
}

export function MobileDraftRow(props: {
  machine: string
  projectId: string
  onSelect: () => void
}) {
  const projectTitle = useProjectName(props.machine, props.projectId)
  const machineIcon = useStore((state) => machineOf(state, props.machine).icon)
  return (
    <li className="list-none py-0.5">
      <div
        role="button"
        tabIndex={0}
        className={cn(surface, 'bg-sidebar-row-active text-sidebar-foreground')}
        onClick={props.onSelect}
      >
        <div className="px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
          <div className="flex h-6 min-w-0 items-center gap-2">
            <ProjectIcon
              machine={props.machine}
              projectId={props.projectId}
              className="size-5"
            />
            <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
              New thread
            </span>
            <HugeiconsIcon
              icon={SquarePenIcon}
              className="text-warning-foreground size-4 shrink-0"
            />
          </div>
          <div className="text-secondary-label mt-1 flex h-5 min-w-0 items-center gap-1.5 text-xs">
            <MachineLogo icon={machineIcon} className="size-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {projectTitle}
              <span className="text-muted-foreground/40 font-normal">
                {' | Draft'}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">now</span>
          </div>
        </div>
      </div>
    </li>
  )
}
