import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  CloudIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

export function Row(props: {
  menu: boolean
  disabled: boolean
  title?: string
  className?: string
  onSelect: () => void
  children: ReactNode
}) {
  if (props.menu) {
    return (
      <DropdownMenuItem
        disabled={props.disabled}
        title={props.title}
        className={props.className}
        onSelect={(event) => {
          event.preventDefault()
          props.onSelect()
        }}
      >
        {props.children}
      </DropdownMenuItem>
    )
  }
  return (
    <button
      disabled={props.disabled}
      title={props.title}
      className={cn(
        'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50',
        props.className
      )}
      onClick={props.onSelect}
    >
      {props.children}
    </button>
  )
}

export function Submenu(props: {
  menu: boolean
  trigger: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  if (props.menu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{props.trigger}</DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
            {props.children}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    )
  }
  return (
    <>
      <button
        aria-expanded={open}
        className="hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
        onClick={() => setOpen(!open)}
      >
        {props.trigger}
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          className="text-muted-foreground size-3.5 shrink-0"
        />
      </button>
      {open && <div className="ps-4">{props.children}</div>}
    </>
  )
}

export function RemoteBranches(props: {
  menu: boolean
  machine: string
  projectId: string
  worktreeId: string | null
  repo: string
  disabled: (branch: string) => boolean
  onSwitch: (branch: string) => void
}) {
  const machine = props.machine
  const projectId = props.projectId
  const worktreeId = props.worktreeId
  const repo = props.repo
  const [remotes, setRemotes] = useState<string[] | null>(null)

  useEffect(() => {
    call(machine, 'git.remoteBranches', { projectId, worktreeId, repo }).then(
      setRemotes,
      showError
    )
  }, [machine, projectId, worktreeId, repo])

  if (remotes === null) {
    return (
      <p className="text-muted-foreground p-2 text-center text-sm">
        Loading remote branches…
      </p>
    )
  }
  if (remotes.length === 0) {
    return (
      <p className="text-muted-foreground p-2 text-center text-sm">
        No remote branches
      </p>
    )
  }
  return remotes.map((branch) => (
    <Row
      key={branch}
      menu={props.menu}
      disabled={props.disabled(branch.slice(branch.indexOf('/') + 1))}
      onSelect={() => props.onSwitch(branch.slice(branch.indexOf('/') + 1))}
    >
      <HugeiconsIcon
        icon={CloudIcon}
        className="text-muted-foreground size-3.5 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{branch}</span>
    </Row>
  ))
}
