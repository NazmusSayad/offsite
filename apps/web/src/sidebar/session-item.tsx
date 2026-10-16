import {
  CircleCheckIcon,
  CircleDashedIcon,
  Delete02Icon,
  EllipsisIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Plug01Icon,
  ShieldQuestionMarkIcon,
  SquarePenIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Activity } from '@server/protocol'
import { useRef, useState } from 'react'
import { ProjectIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { providerNames, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProjectName } from '@/projects'
import { editSession, type MachineSession, removeSession } from '@/store'

const surface =
  'group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export function SessionItem(props: {
  session: MachineSession
  slim: boolean
  selected: boolean
  activity: Activity | undefined
  unseen: boolean
  saved: boolean
  onSelect: () => void
}) {
  const session = props.session
  const projectTitle = useProjectName(session.machine, session.cwd)
  const [title, setTitle] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const waiting = props.activity?.waiting === true
  const turning = !waiting && props.activity?.running === true
  const working =
    turning ||
    (!waiting && Object.values(props.activity?.tasks ?? {}).includes('running'))
  const done = !waiting && !working && props.unseen
  const recede = !props.selected && !waiting && !done

  const menu = props.saved && (
    <DropdownMenu onOpenChange={() => setConfirming(false)}>
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
          if (field.current === null) return
          event.preventDefault()
          field.current.focus()
          field.current.select()
        }}
      >
        <DropdownMenuItem onSelect={() => setTitle(session.title)}>
          <HugeiconsIcon icon={PencilIcon} />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: session.status === 'pinned' ? 'active' : 'pinned',
            })
          }
        >
          {session.status === 'pinned' ? (
            <HugeiconsIcon icon={PinOffIcon} />
          ) : (
            <HugeiconsIcon icon={PinIcon} />
          )}
          {session.status === 'pinned' ? 'Unpin' : 'Pin'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void editSession(session.machine, session.id, {
              status: session.status === 'minimized' ? 'active' : 'minimized',
            })
          }
        >
          {session.status === 'minimized' ? (
            <HugeiconsIcon icon={MaximizeIcon} />
          ) : (
            <HugeiconsIcon icon={MinimizeIcon} />
          )}
          {session.status === 'minimized' ? 'Restore' : 'Minimize'}
        </DropdownMenuItem>
        {session.status !== 'inactive' && (
          <DropdownMenuItem
            onSelect={() =>
              void editSession(session.machine, session.id, {
                status: 'inactive',
              })
            }
          >
            <HugeiconsIcon icon={Plug01Icon} />
            Make inactive
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          title={`Also removes it from ${providerNames[session.provider]}`}
          onSelect={(event) => {
            if (confirming) {
              void removeSession(session.machine, session.id)
              return
            }
            event.preventDefault()
            setConfirming(true)
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          {confirming ? 'Click again to delete' : 'Delete'}
        </DropdownMenuItem>
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
          if (value !== '' && value !== session.title)
            void editSession(session.machine, session.id, { title: value })
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
            if (event.key === 'Escape') setTitle(null)
          }}
          className="text-foreground ring-ring/50 focus:ring-ring w-full rounded-sm bg-transparent text-sm font-medium ring-1 outline-none ring-inset"
        />
      </form>
    )

  const rowState = cn(
    props.selected && 'bg-sidebar-row-active text-sidebar-foreground',
    !props.selected &&
      recede &&
      'text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground',
    !props.selected &&
      !recede &&
      'text-sidebar-foreground hover:bg-sidebar-row-hover bg-transparent'
  )

  if (props.slim)
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
            if (event.key === 'Enter') props.onSelect()
          }}
        >
          <span className="flex shrink-0 items-center opacity-40 grayscale transition-opacity group-hover/sidebar-row:opacity-100 group-hover/sidebar-row:grayscale-0">
            <ProjectIcon machine={session.machine} cwd={session.cwd} />
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
      </li>
    )

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
          if (event.key === 'Enter') props.onSelect()
        }}
      >
        <div className="px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
          <div className="flex h-6 min-w-0 items-center gap-2">
            <ProjectIcon
              machine={session.machine}
              cwd={session.cwd}
              className="size-5"
            />
            {titleText}
            {session.status === 'pinned' && (
              <HugeiconsIcon
                icon={PinIcon}
                className="text-muted-foreground/65 size-3 shrink-0"
              />
            )}
            {working && (
              <span
                title={turning ? 'Working' : 'Running in background'}
                className={cn(
                  'flex',
                  turning ? 'text-info' : 'text-muted-foreground'
                )}
              >
                <HugeiconsIcon
                  icon={CircleDashedIcon}
                  className="size-4 shrink-0 animate-spin"
                />
              </span>
            )}
            {waiting && (
              <span
                title="Waiting for approval"
                className="text-warning-foreground flex"
              >
                <HugeiconsIcon
                  icon={ShieldQuestionMarkIcon}
                  className="size-4 shrink-0"
                />
              </span>
            )}
            {done && (
              <span title="Done" className="text-success flex">
                <HugeiconsIcon
                  icon={CircleCheckIcon}
                  className="size-4 shrink-0"
                />
              </span>
            )}
          </div>
          <div className="text-secondary-label mt-1 flex h-5 min-w-0 items-center gap-1.5 text-xs">
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
                  void editSession(session.machine, session.id, {
                    status: 'inactive',
                  })
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
    </li>
  )
}

export function DraftRow(props: {
  machine: string
  cwd: string
  onSelect: () => void
}) {
  const projectTitle = useProjectName(props.machine, props.cwd)
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
              cwd={props.cwd}
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
