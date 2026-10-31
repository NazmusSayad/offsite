import {
  AlarmClockIcon,
  PinIcon,
  Plug01Icon,
  PlugZapIcon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'
import { useRef, useState } from 'react'
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
import { machineOf, type MachineSession, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'
import { SessionTitle } from './session-title'

const surface =
  'relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none touch-pan-y [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export function MobileSessionItem(props: {
  session: MachineSession
  slim: boolean
  selected: boolean
  activity: SessionActivity | undefined
  unseen: boolean
  saved: boolean
  scope: { machine: string; projectId: string } | null
  onSelect: () => void
}) {
  const session = props.session
  const projectTitle = useProjectName(session.machine, session.projectId)
  const machineIcon = useStore(
    (state) => machineOf(state, session.machine).icon
  )
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const [offset, setOffset] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const swipe = useRef<{ x: number; y: number; swiping: boolean } | null>(null)
  const swiped = useRef(false)
  const waiting = props.activity?.waiting === true
  const backgroundRunning = Object.values(props.activity?.tasks ?? {}).includes(
    'running'
  )
  const working =
    !waiting && (props.activity?.running === true || backgroundRunning)
  const busy = props.activity?.running === true || backgroundRunning
  const done = !waiting && !working && props.unseen
  const recede = !props.selected && !waiting && !done

  function makeInactive() {
    void deactivateSession(session.machine, session.id, props.scope)
  }

  function deactivate() {
    if (busy) {
      setWarning(true)
      return
    }
    makeInactive()
  }

  function release(event: React.PointerEvent<HTMLDivElement>) {
    const start = swipe.current
    swipe.current = null
    setOffset(0)
    if (start === null || !start.swiping) {
      return
    }
    swiped.current = true
    if (event.clientX - start.x > event.currentTarget.offsetWidth * 0.4) {
      if (session.status === 'inactive') {
        void editSession(session.machine, session.id, { status: 'active' })
      } else {
        deactivate()
      }
    }
  }

  const swipeHandlers = {
    onClick: () => {
      if (swiped.current) {
        swiped.current = false
        return
      }
      props.onSelect()
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!props.saved || event.pointerType !== 'touch') {
        return
      }
      swiped.current = false
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
      if (!start.swiping && dx <= Math.abs(dy)) {
        swipe.current = null
        return
      }
      start.swiping = true
      setOffset(Math.max(0, dx))
    },
    onPointerUp: release,
    onPointerCancel: () => {
      swipe.current = null
      setOffset(0)
    },
  }

  const swipeBackground = offset > 0 && (
    <div
      className={cn(
        'absolute inset-x-0 flex items-center rounded-md px-4 text-white',
        props.slim ? 'inset-y-0' : 'inset-y-0.5',
        session.status === 'inactive' ? 'bg-success' : 'bg-destructive'
      )}
    >
      <HugeiconsIcon
        icon={session.status === 'inactive' ? PlugZapIcon : Plug01Icon}
        className="size-6"
      />
    </div>
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
            Stop and Make Inactive
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
        mobile={true}
        onDeactivate={deactivate}
        onRename={() => setTitle(session.title)}
      />
    </ContextMenuContent>
  )

  const titleText =
    title === null ? (
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          recede ? 'text-secondary-label font-normal' : 'font-medium',
          !recede && (props.unseen || waiting) && 'text-foreground',
          !recede && !props.unseen && !waiting && 'text-foreground/90'
        )}
      >
        <SessionTitle session={session} />
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

  if (props.slim) {
    return (
      <li className="relative list-none">
        {swipeBackground}
        <ContextMenu>
          <ContextMenuTrigger asChild disabled={!props.saved}>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                surface,
                rowState,
                'flex h-9 items-center gap-2.5 px-2.5',
                offset > 0 && 'bg-sidebar'
              )}
              style={
                offset > 0
                  ? { transform: `translateX(${offset}px)` }
                  : undefined
              }
              {...swipeHandlers}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  props.onSelect()
                }
              }}
            >
              <span className="flex shrink-0 items-center opacity-40 grayscale">
                <ProjectIcon
                  machine={session.machine}
                  projectId={session.projectId}
                />
              </span>
              {titleText}
              <span className="text-secondary-label ml-auto shrink-0 text-xs tabular-nums">
                {timeAgo(session.updatedAt)}
              </span>
            </div>
          </ContextMenuTrigger>
          {menu}
        </ContextMenu>
        {stopDialog}
      </li>
    )
  }

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
              working && !props.selected && 'opacity-70',
              offset > 0 && 'bg-sidebar'
            )}
            style={
              offset > 0 ? { transform: `translateX(${offset}px)` } : undefined
            }
            {...swipeHandlers}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                props.onSelect()
              }
            }}
          >
            <div className="px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
              <div className="flex h-6 min-w-0 items-center gap-2">
                <ProjectIcon
                  machine={session.machine}
                  projectId={session.projectId}
                  className="size-5"
                />
                {titleText}
                {session.status === 'pinned' && (
                  <HugeiconsIcon
                    icon={PinIcon}
                    className="text-muted-foreground/65 size-3 shrink-0"
                  />
                )}
                <SessionStatus
                  activity={props.activity}
                  backgroundRunning={backgroundRunning}
                  done={done}
                />
              </div>
              <div className="text-secondary-label mt-1 flex h-5 min-w-0 items-center gap-1.5 text-xs">
                <MachineLogo icon={machineIcon} className="size-3 shrink-0" />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
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
                {session.status === 'snoozed' && (
                  <HugeiconsIcon
                    icon={AlarmClockIcon}
                    className="size-3 shrink-0"
                  />
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
