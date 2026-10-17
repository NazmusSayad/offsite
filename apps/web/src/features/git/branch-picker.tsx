import {
  CheckIcon,
  GitBranchIcon,
  PlusSignIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useRef, useState } from 'react'
import { call } from '@/api/connection'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

export function BranchPicker(props: {
  machine: string
  projectId: string
  repo: GitRepo
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [switching, setSwitching] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const name = query.trim()
  const matches = (branches ?? []).filter((branch) =>
    branch.toLowerCase().includes(name.toLowerCase())
  )
  const exists = (branches ?? []).includes(name)

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      return
    }
    setQuery('')
    setBranches(null)
    call(props.machine, 'git.localBranches', {
      projectId: props.projectId,
      repo: props.repo.path,
    }).then(setBranches, showError)
  }

  async function switchTo(branch: string, create: boolean) {
    setSwitching(true)
    try {
      await call(props.machine, 'git.switch', {
        projectId: props.projectId,
        repo: props.repo.path,
        branch,
        create,
      })
      setOpen(false)
    } catch (error) {
      showError(error)
    } finally {
      setSwitching(false)
      props.onRefresh()
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground hidden max-w-48 cursor-pointer items-center gap-1 text-xs sm:flex"
          title="Switch or create a branch"
        >
          <HugeiconsIcon icon={GitBranchIcon} className="size-3.5 shrink-0" />
          <span className="truncate">{props.repo.branch ?? 'detached'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-86.5 w-72 flex-col"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchInput.current?.focus()
        }}
      >
        <div className="shrink-0 px-3 pt-2.5">
          <div className="border-border/70 focus-within:border-ring relative border-b pb-1.5 transition-colors">
            <HugeiconsIcon
              icon={SearchIcon}
              className="text-muted-foreground/55 pointer-events-none absolute top-1.5 left-0 size-4"
            />
            <input
              ref={searchInput}
              value={query}
              placeholder="Search or create a branch..."
              disabled={switching}
              className="placeholder:text-muted-foreground/70 h-6.5 w-full bg-transparent ps-5 text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || name === '' || branches === null) {
                  return
                }
                event.preventDefault()
                void switchTo(name, !exists)
              }}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
          {branches === null && (
            <p className="text-muted-foreground p-2 text-center text-sm">
              Loading branches…
            </p>
          )}
          {branches !== null && matches.length === 0 && name === '' && (
            <p className="text-muted-foreground p-2 text-center text-sm">
              No branches
            </p>
          )}
          {matches.map((branch) => (
            <button
              key={branch}
              disabled={switching}
              className={cn(
                'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50',
                branch === props.repo.branch &&
                  'text-foreground bg-foreground/[0.08]'
              )}
              onClick={() => {
                if (branch === props.repo.branch) {
                  setOpen(false)
                  return
                }
                void switchTo(branch, false)
              }}
            >
              <span className="min-w-0 flex-1 truncate">{branch}</span>
              {branch === props.repo.branch && (
                <HugeiconsIcon
                  icon={CheckIcon}
                  strokeWidth={2.25}
                  className="size-3.5 shrink-0"
                />
              )}
            </button>
          ))}
          {branches !== null && name !== '' && !exists && (
            <button
              disabled={switching}
              className="hover:bg-accent hover:text-accent-foreground flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
              onClick={() => void switchTo(name, true)}
            >
              <HugeiconsIcon
                icon={PlusSignIcon}
                className="size-3.5 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate">
                Create branch <span className="font-medium">{name}</span>
              </span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
