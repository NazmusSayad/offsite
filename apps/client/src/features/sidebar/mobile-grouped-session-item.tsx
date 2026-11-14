import { PinIcon, ZzzIcon, TickDouble01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'
import { useRef, useState } from 'react'
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
import { timeAgo } from '@/lib/format'
import { deactivateSession, editSession } from '@/lib/sessions'
import { type MachineSession, threadState } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'
import { SessionTitle } from './session-title'
import { secondarySwipe } from './swipe-background'
import { SwipeRow } from './swipe-row'

const surface =
  'relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none touch-pan-y [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export function MobileGroupedSessionItem(props: {
  session: MachineSession
  selected: boolean
  activity: SessionActivity | undefined
  unseen: boolean
  saved: boolean
  onSelect: () => void
}) {
  const session = props.session
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const thread = threadState(props.activity, props.unseen)
  const recede = !props.selected && !thread.waiting && !thread.done

  function makeInactive() {
    void deactivateSession(session.machine, session.id, null)
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
          recede ? 'text-secondary-label font-normal' : 'font-medium',
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
    <li className="list-none">
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
                'flex h-9 items-center gap-2 px-2.5',
                thread.working &&
                  !props.selected &&
                  'opacity-70 in-data-swiping:opacity-100',
                'in-data-swiping:bg-sidebar'
              )}
              onClick={() => props.onSelect()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  props.onSelect()
                }
              }}
            >
              {titleText}
              {session.status === 'pinned' && (
                <HugeiconsIcon
                  icon={PinIcon}
                  className="text-muted-foreground/65 size-3 shrink-0"
                />
              )}
              {session.status === 'snoozed' && (
                <HugeiconsIcon
                  icon={ZzzIcon}
                  className="text-secondary-label size-3 shrink-0"
                />
              )}
              <SessionStatus
                session={session}
                activity={props.activity}
                done={thread.done}
              />
              <span className="text-secondary-label shrink-0 text-xs tabular-nums">
                {timeAgo(session.updatedAt)}
              </span>
            </div>
          </ContextMenuTrigger>
          {menu}
        </ContextMenu>
      </SwipeRow>
      {stopDialog}
    </li>
  )
}
