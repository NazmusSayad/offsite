import { ArrowRight01Icon, CloudIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

export function Submenu(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  children: ReactNode
}) {
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
            props.open && 'bg-accent text-accent-foreground'
          )}
          onMouseEnter={() => props.onOpenChange(true)}
          onClick={(event) => {
            event.preventDefault()
            props.onOpenChange(true)
          }}
        >
          {props.trigger}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-6}
        className="max-h-80 w-64 overflow-y-auto p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {props.children}
      </PopoverContent>
    </Popover>
  )
}

export function RemoteBranches(props: {
  machine: string
  projectId: string
  repo: string
  disabled: (branch: string) => boolean
  onSwitch: (branch: string) => void
}) {
  const machine = props.machine
  const projectId = props.projectId
  const repo = props.repo
  const [remotes, setRemotes] = useState<string[] | null>(null)

  useEffect(() => {
    call(machine, 'git.remoteBranches', { projectId, repo }).then(
      setRemotes,
      showError
    )
  }, [machine, projectId, repo])

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
    <button
      key={branch}
      disabled={props.disabled(branch.slice(branch.indexOf('/') + 1))}
      className="hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
      onClick={() => props.onSwitch(branch.slice(branch.indexOf('/') + 1))}
    >
      <HugeiconsIcon
        icon={CloudIcon}
        className="text-muted-foreground size-3.5 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate">{branch}</span>
    </button>
  ))
}
