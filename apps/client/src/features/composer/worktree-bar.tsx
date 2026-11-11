import {
  ArrowDown01Icon,
  CircleDashedIcon,
  CloudIcon,
  FolderGit2Icon,
  GitBranchPlusIcon,
  GitBranchIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  GitRepo,
  WorktreeBases,
  WorktreeChoice,
  WorktreeStage,
} from '@offsite/core/git'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logger } from '@/lib/log'
import { openSession } from '@/lib/sessions'
import { getState, update, useStore } from '@/lib/store'
import { cn, errorMessage, touch } from '@/lib/utils'
import { RepoStatus } from './repo-status'

const log = logger.withTag('worktree')

const NEW_WORKTREE = 'new-worktree'

export function WorktreeBar(props: {
  machine: string
  projectId: string
  repos: GitRepo[]
  onRefresh: () => void
}) {
  const worktree = useStore((state) => state.worktree)
  const stage = useStore((state) => state.worktreeStage)
  const repo = props.repos.find((item) => item.path === '')

  if (repo === undefined) {
    return null
  }

  return (
    <div className="absolute inset-x-0 top-full">
      <div className="composer-glass @container relative mx-auto -mt-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-b-2xl border border-t-0 border-(--composer-outline) px-1 pt-[calc(1rem+1px+0.25rem)] pb-1 text-xs/4">
        {stage !== null && (
          <span className="text-muted-foreground flex h-7 min-w-0 items-center gap-1.5 px-2">
            <HugeiconsIcon
              icon={CircleDashedIcon}
              className="size-3.5 shrink-0 animate-spin"
            />
            <span className="truncate">{stageText(stage)}</span>
          </span>
        )}
        {stage === null && (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="text-foreground/90 hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/40 flex h-6 max-w-56 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-2"
                  title="Choose where the agent works"
                >
                  <HugeiconsIcon
                    icon={worktree === null ? GitBranchIcon : GitBranchPlusIcon}
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                  <span
                    className={cn(
                      'truncate',
                      worktree !== null && '@max-sm:hidden'
                    )}
                  >
                    {worktree === null
                      ? (repo.branch ?? 'Detached HEAD')
                      : 'New worktree'}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <LocationMenu
                  machine={props.machine}
                  projectId={props.projectId}
                />
              </DropdownMenuContent>
            </DropdownMenu>
            <div
              key={worktree === null ? 'local' : 'worktree'}
              className={cn(
                'animate-in fade-in-0 flex h-7 flex-1 items-center gap-1 duration-150 motion-reduce:animate-none',
                worktree !== null && 'min-w-0'
              )}
            >
              {worktree === null && (
                <RepoStatus
                  repo={repo}
                  target={{
                    machine: props.machine,
                    projectId: props.projectId,
                    onRefresh: props.onRefresh,
                  }}
                />
              )}
              {worktree !== null && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/30 flex h-6 max-w-48 min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 outline-none focus-visible:ring-2"
                        title="Choose the branch the worktree starts from"
                      >
                        <span className="text-muted-foreground hidden shrink-0 @md:inline">
                          from
                        </span>
                        <span className="truncate">
                          {worktree.base === null
                            ? 'default branch'
                            : shortRef(worktree.base)}
                        </span>
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          className="text-muted-foreground size-3.5 shrink-0"
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="flex w-72 flex-col overflow-hidden p-0"
                    >
                      <BaseMenu
                        machine={props.machine}
                        projectId={props.projectId}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <label className="focus-within:bg-accent/60 hover:bg-accent/40 flex h-6 min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-md px-2">
                    <HugeiconsIcon
                      icon={GitBranchIcon}
                      className="text-muted-foreground size-3.5 shrink-0"
                    />
                    <input
                      value={worktree.name}
                      placeholder="Branch name (auto if empty)"
                      aria-label="New branch name"
                      spellCheck={false}
                      className="placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-ellipsis outline-none"
                      onChange={(event) =>
                        update({
                          worktree: { ...worktree, name: event.target.value },
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LocationMenu(props: { machine: string; projectId: string }) {
  const worktree = useStore((state) => state.worktree)
  const [worktrees, setWorktrees] = useState<WorktreeChoice[] | null>(null)

  useEffect(() => {
    let current = true
    async function load() {
      try {
        const found = await call(props.machine, 'projects.worktrees', {
          projectId: props.projectId,
        })
        if (current) {
          setWorktrees(found)
        }
      } catch (error) {
        log.error('could not load the worktrees', error)
        toast(errorMessage(error))
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.projectId])

  if (worktrees === null) {
    return <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
  }

  return (
    <DropdownMenuRadioGroup
      value={worktree === null ? props.projectId : NEW_WORKTREE}
    >
      {worktrees.map((item) => (
        <DropdownMenuRadioItem
          key={item.folder}
          value={item.projectId ?? item.folder}
          title={item.folder}
          onSelect={() => {
            if (item.projectId === props.projectId) {
              update({ worktree: null })
              return
            }
            void openWorktree(props.machine, props.projectId, item)
          }}
        >
          <HugeiconsIcon
            icon={item.worktree ? FolderGit2Icon : GitBranchIcon}
            className="text-muted-foreground size-3.5"
          />
          <span className="min-w-0 flex-1 truncate">
            {item.branch ?? 'Detached HEAD'}
          </span>
          {item.worktree && (
            <span className="text-muted-foreground max-w-28 shrink-0 truncate text-xs">
              {folderName(item.folder)}
            </span>
          )}
        </DropdownMenuRadioItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuRadioItem
        value={NEW_WORKTREE}
        onSelect={() => {
          if (worktree === null) {
            update({ worktree: { name: '', base: null } })
          }
        }}
      >
        <HugeiconsIcon
          icon={GitBranchPlusIcon}
          className="text-muted-foreground size-3.5"
        />
        <span className="min-w-0 flex-1 truncate">New worktree</span>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  )
}

function BaseMenu(props: { machine: string; projectId: string }) {
  const [query, setQuery] = useState('')
  const [bases, setBases] = useState<WorktreeBases | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!touch.matches) {
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      try {
        const found = await call(props.machine, 'projects.bases', {
          projectId: props.projectId,
          query,
        })
        if (current) {
          setBases(found)
        }
      } catch (error) {
        log.error('could not load the branches', error)
        if (current) {
          toast(errorMessage(error))
        }
      }
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [props.machine, props.projectId, query])

  function pick(ref: string) {
    if (bases === null) {
      return
    }
    const current = getState().worktree
    if (current === null) {
      return
    }
    update({
      worktree: {
        ...current,
        base: ref === bases.defaultBase ? null : ref,
      },
    })
  }

  function item(ref: string, note: string | null) {
    return (
      <DropdownMenuItem
        key={ref}
        data-base
        title={`Start a new branch from the ${ref.startsWith('refs/remotes/') ? 'remote' : 'local'} branch ${shortRef(ref)}`}
        onSelect={() => pick(ref)}
      >
        <HugeiconsIcon
          icon={ref.startsWith('refs/remotes/') ? CloudIcon : GitBranchIcon}
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <span className="min-w-0 flex-1 truncate">{shortRef(ref)}</span>
        {note !== null && (
          <span className="text-muted-foreground text-xs">{note}</span>
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-col select-none"
      onKeyDownCapture={(event) => {
        if (
          event.target !== inputRef.current &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ((event.key.length === 1 && event.key !== ' ') ||
            event.key === 'Backspace')
        ) {
          event.stopPropagation()
          inputRef.current?.focus()
        }
      }}
    >
      <div className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <HugeiconsIcon
          icon={SearchIcon}
          className="text-muted-foreground size-4 shrink-0"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              return
            }
            event.stopPropagation()
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              listRef.current
                ?.querySelector<HTMLElement>(
                  '[role^=menuitem]:not([data-disabled])'
                )
                ?.focus()
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              listRef.current
                ?.querySelector<HTMLElement>('[data-base]')
                ?.click()
            }
          }}
          placeholder="Search branches"
          aria-label="Search branches"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div ref={listRef} className="max-h-80 min-h-0 overflow-y-auto p-1">
        {bases === null && (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        )}
        {bases !== null && (
          <>
            {query.trim() === '' && item(bases.defaultBase, 'Default')}
            {bases.local.length > 0 && (
              <DropdownMenuLabel>Local branches</DropdownMenuLabel>
            )}
            {bases.local.map((ref) => item(ref, null))}
            {bases.remote.length > 0 && (
              <DropdownMenuLabel>Remote branches</DropdownMenuLabel>
            )}
            {bases.remote.map((ref) => item(ref, null))}
            {query.trim() !== '' &&
              bases.local.length === 0 &&
              bases.remote.length === 0 && (
                <div className="text-muted-foreground px-2 py-6 text-center text-sm">
                  No matching branches
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

async function openWorktree(
  machine: string,
  projectId: string,
  choice: WorktreeChoice
) {
  try {
    const id =
      choice.projectId ??
      (await call(machine, 'projects.addWorktree', {
        projectId,
        folder: choice.folder,
      }))
    openSession({ machine, projectId: id, sessionId: null })
  } catch (error) {
    log.error('could not open the worktree', error)
    toast(errorMessage(error))
  }
}

function shortRef(ref: string) {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/')) {
    return ref.slice('refs/remotes/'.length)
  }
  throw new Error(`${ref} is not a branch`)
}

function folderName(folder: string) {
  return folder.split(/[\\/]/).at(-1) ?? folder
}

export function stageText(stage: WorktreeStage) {
  switch (stage) {
    case 'fetch':
      return 'Fetching the base branch…'
    case 'name':
      return 'Naming the branch…'
    case 'create':
      return 'Creating the worktree…'
  }
}
