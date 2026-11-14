import {
  EllipsisIcon,
  PinIcon,
  TickDouble01Icon,
  ZzzIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'
import { useRef, useState } from 'react'
import { HotkeyHint } from '@/components/hotkey-hint'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { timeAgo } from '@/lib/format'
import { deactivateSession, editSession } from '@/lib/sessions'
import { type MachineSession, threadState } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'
import { SessionTitle } from './session-title'

const surface =
  'group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export function DesktopGroupedSessionItem(props: {
  session: MachineSession
  selected: boolean
  activity: SessionActivity | undefined
  unseen: boolean
  saved: boolean
  onSelect: () => void
  hotkey: string | null
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

  const stopDialog = (
    <AlertDialog open={warning} onOpenChange={setWarning}>
      <AlertDialogContent>
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

  const menu = props.saved && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground inline-flex h-5 cursor-pointer items-center rounded-md px-1.5"
          title="Thread actions"
          onClick={(event) => event.stopPropagation()}
        >
          <HugeiconsIcon icon={EllipsisIcon} className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onClick={(event) => event.stopPropagation()}
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
          context={false}
          mobile={false}
          onDeactivate={deactivate}
          onDebug={null}
          onRename={() => setTitle(session.title)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const contextMenu = (
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
        mobile={false}
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
    recede &&
      'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground has-[[data-state=open]]:bg-sidebar-row-hover has-[[data-state=open]]:text-sidebar-foreground',
    !props.selected &&
      !recede &&
      'text-sidebar-foreground hover:bg-sidebar-row-hover has-[[data-state=open]]:bg-sidebar-row-hover bg-transparent'
  )

  return (
    <li className="list-none">
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
                'opacity-70 transition-opacity focus-within:opacity-100 hover:opacity-100'
            )}
            onClick={props.onSelect}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                props.onSelect()
              }
            }}
          >
            <span className="group-any-hover/sidebar-row:mask-r-from-[calc(100%-5rem)] group-any-hover/sidebar-row:mask-r-to-[calc(100%-3rem)] flex min-w-0 flex-1 items-center gap-2 group-has-[[data-state=open]]/sidebar-row:mask-r-from-[calc(100%-5rem)] group-has-[[data-state=open]]/sidebar-row:mask-r-to-[calc(100%-3rem)]">
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
              {props.hotkey !== null && (
                <HotkeyHint keyName={props.hotkey} placement="row" />
              )}
            </span>
            {props.saved && (
              <div className="group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100 pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 opacity-0 transition-opacity has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
                {menu}
                <button
                  className="text-muted-foreground hover:text-foreground ms-0.5 me-0.5 inline-flex size-5 cursor-pointer items-center justify-center transition-colors"
                  title="Done"
                  aria-label="Done"
                  onClick={(event) => {
                    event.stopPropagation()
                    deactivate()
                  }}
                >
                  <HugeiconsIcon
                    icon={TickDouble01Icon}
                    strokeWidth={1.35}
                    className="size-5 scale-110"
                  />
                </button>
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        {contextMenu}
      </ContextMenu>
      {stopDialog}
    </li>
  )
}
