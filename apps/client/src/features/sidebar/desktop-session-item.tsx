import {
  AlarmClockIcon,
  EllipsisIcon,
  PinIcon,
  Plug01Icon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'
import { useRef, useState } from 'react'
import { useProjectName } from '@/api/projects'
import { machineIcons, ProjectIcon } from '@/components/icons'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { timeAgo } from '@/lib/format'
import { deactivateSession, editSession } from '@/lib/sessions'
import { machineOf, type MachineSession, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SessionMenuItems } from './session-menu-items'
import { SessionStatus } from './session-status'

const surface =
  'group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export function DesktopSessionItem(props: {
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
    (state) => machineIcons[machineOf(state, session.machine).icon]
  )
  const [title, setTitle] = useState<string | null>(null)
  const [warning, setWarning] = useState(false)
  const field = useRef<HTMLInputElement>(null)
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
          mobile={false}
          onDeactivate={deactivate}
          onRename={() => setTitle(session.title)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
        {session.title}
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
      'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground',
    !props.selected &&
      !recede &&
      'text-sidebar-foreground hover:bg-sidebar-row-hover bg-transparent'
  )

  if (props.slim) {
    return (
      <li className="list-none">
        <div
          role="button"
          tabIndex={0}
          className={cn(
            surface,
            rowState,
            'flex h-9 items-center gap-2.5 px-2.5'
          )}
          onClick={props.onSelect}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              props.onSelect()
            }
          }}
        >
          <span className="flex shrink-0 items-center opacity-40 grayscale transition-opacity group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0">
            <ProjectIcon
              machine={session.machine}
              projectId={session.projectId}
            />
          </span>
          {titleText}
          <span className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
            <span className="text-secondary-label group-any-hover/sidebar-row:opacity-0 inline-flex justify-end text-xs tabular-nums transition-opacity">
              {timeAgo(session.updatedAt)}
            </span>
            <span className="group-any-hover/sidebar-row:opacity-100 absolute inset-y-0 right-0 -mr-1 flex items-center opacity-0 transition-opacity has-[[data-state=open]]:opacity-100">
              {menu}
            </span>
          </span>
        </div>
        {stopDialog}
      </li>
    )
  }

  return (
    <li className="list-none py-0.5">
      <div
        role="button"
        tabIndex={0}
        className={cn(
          surface,
          rowState,
          working &&
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
            <HugeiconsIcon icon={machineIcon} className="size-3 shrink-0" />
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
        {props.saved && (
          <div
            className={cn(
              'group-any-hover/sidebar-row:pointer-events-auto group-any-hover/sidebar-row:opacity-100 pointer-events-none absolute inset-y-0 right-0 flex w-20 flex-col items-end bg-linear-to-l from-50% to-transparent py-(--sidebar-content-inset) pr-1.5 opacity-0 transition-opacity has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100',
              props.selected
                ? 'from-sidebar-row-active'
                : 'from-sidebar-row-hover'
            )}
          >
            <div className="flex h-6 items-center">
              <button
                className="text-muted-foreground hover:text-foreground inline-flex h-5 cursor-pointer items-center rounded-md px-1.5"
                title="Make inactive"
                aria-label="Make inactive"
                onClick={(event) => {
                  event.stopPropagation()
                  deactivate()
                }}
              >
                <HugeiconsIcon
                  icon={Plug01Icon}
                  className="size-3.5 scale-160"
                />
              </button>
            </div>
            <div className="mt-1 flex h-5 items-center">{menu}</div>
          </div>
        )}
      </div>
      {stopDialog}
    </li>
  )
}

export function DesktopDraftRow(props: {
  machine: string
  projectId: string
  onSelect: () => void
}) {
  const projectTitle = useProjectName(props.machine, props.projectId)
  const machineIcon = useStore(
    (state) => machineIcons[machineOf(state, props.machine).icon]
  )
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
            <HugeiconsIcon icon={machineIcon} className="size-3 shrink-0" />
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
