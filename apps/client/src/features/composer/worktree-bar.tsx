import {
  CircleDashedIcon,
  GitBranchIcon,
  GitForkIcon,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logger } from '@/lib/log'
import { openSession } from '@/lib/sessions'
import { getState, machineOf, update, useStore } from '@/lib/store'
import { cn, errorMessage, touch } from '@/lib/utils'

const log = logger.withTag('worktree')

export function WorktreeBar(props: { machine: string; projectId: string }) {
  const worktree = useStore((state) => state.worktree)
  const stage = useStore((state) => state.worktreeStage)
  const status = useStore((state) => machineOf(state, props.machine).status)
  const [repos, setRepos] = useState<GitRepo[] | null>(null)
  const repo = repos?.find((item) => item.path === '')

  useEffect(() => {
    if (status !== 'online') {
      return
    }
    let current = true
    async function load() {
      try {
        const found = await call(props.machine, 'git.status', {
          projectId: props.projectId,
        })
        if (current) {
          setRepos(found)
        }
      } catch (error) {
        log.error('could not load the git status', error)
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, status])

  if (repo === undefined) {
    return null
  }

  return (
    <div className="absolute inset-x-0 top-full">
      <div className="composer-glass relative mx-auto -mt-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] flex-wrap items-center gap-0.5 rounded-b-2xl border border-t-0 border-(--composer-outline) px-1 pt-[calc(1rem+1px+0.25rem)] pb-1 text-xs/4">
        {stage !== null && (
          <span className="text-muted-foreground flex h-6 min-w-0 items-center gap-1.5 px-2">
            <HugeiconsIcon
              icon={CircleDashedIcon}
              className="size-3.5 shrink-0 animate-spin"
            />
            <span className="truncate">{stageText(stage)}</span>
          </span>
        )}
        {stage === null && (
          <>
            <div className="flex min-w-0 items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'text-muted-foreground hover:text-foreground flex h-6 max-w-56 min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2 outline-none',
                      worktree === null &&
                        'text-foreground bg-foreground/[0.07]'
                    )}
                    title="Choose where the agent works"
                  >
                    <HugeiconsIcon
                      icon={GitBranchIcon}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate">
                      {repo.branch ?? 'Detached'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <WorktreeMenu
                    machine={props.machine}
                    projectId={props.projectId}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                className={cn(
                  'text-muted-foreground hover:text-foreground flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2',
                  worktree !== null && 'text-foreground bg-foreground/[0.07]'
                )}
                title="Start in a new worktree"
                onClick={() =>
                  update({
                    worktree:
                      worktree === null ? { name: '', base: null } : null,
                  })
                }
              >
                <HugeiconsIcon
                  icon={GitForkIcon}
                  className="size-3.5 shrink-0"
                />
                New worktree
              </button>
              {worktree !== null && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="text-muted-foreground hover:text-foreground flex h-6 max-w-40 shrink-0 cursor-pointer items-center rounded-full px-2 outline-none"
                      title="Choose the branch the worktree starts from"
                    >
                      <span className="truncate">
                        from{' '}
                        {worktree.base === null
                          ? 'default branch'
                          : shortRef(worktree.base)}
                      </span>
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
              )}
            </div>
            {worktree !== null && (
              <input
                value={worktree.name}
                placeholder="Branch name, or leave empty to name it from the message"
                spellCheck={false}
                className="placeholder:text-muted-foreground/70 h-6 min-w-40 flex-1 bg-transparent px-2 outline-none"
                onChange={(event) =>
                  update({
                    worktree: { ...worktree, name: event.target.value },
                  })
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function WorktreeMenu(props: { machine: string; projectId: string }) {
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
    <DropdownMenuRadioGroup value={props.projectId}>
      <DropdownMenuLabel>Work in</DropdownMenuLabel>
      {worktrees.map((item) => (
        <DropdownMenuRadioItem
          key={item.folder}
          value={item.projectId ?? item.folder}
          title={item.folder}
          onSelect={() =>
            void openWorktree(props.machine, props.projectId, item)
          }
        >
          <span className="min-w-0 flex-1 truncate">
            {item.branch ?? 'Detached'}
          </span>
          <span className="text-muted-foreground max-w-28 truncate text-xs">
            {item.worktree ? folderName(item.folder) : 'Project folder'}
          </span>
        </DropdownMenuRadioItem>
      ))}
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
    const checkedOut = ref.startsWith('refs/heads/')
      ? bases.worktrees.find((item) => item.branch === shortRef(ref))
      : undefined
    if (checkedOut !== undefined) {
      void openWorktree(props.machine, props.projectId, checkedOut)
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
    const checkedOut =
      ref.startsWith('refs/heads/') &&
      bases?.worktrees.some((entry) => entry.branch === shortRef(ref)) === true
    return (
      <DropdownMenuItem
        key={ref}
        data-base
        title={
          checkedOut
            ? `${shortRef(ref)} is already checked out, open that folder`
            : `Start a new branch from ${shortRef(ref)}`
        }
        onSelect={() => pick(ref)}
      >
        <span className="min-w-0 flex-1 truncate">{shortRef(ref)}</span>
        {(note !== null || checkedOut) && (
          <span className="text-muted-foreground text-xs">
            {checkedOut ? 'Open' : note}
          </span>
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-col"
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
              <DropdownMenuLabel>
                {query.trim() === '' ? 'Recent local branches' : 'Local'}
              </DropdownMenuLabel>
            )}
            {bases.local.map((ref) => item(ref, null))}
            {bases.remote.length > 0 && (
              <DropdownMenuLabel>
                {query.trim() === '' ? 'Your latest remote branches' : 'Remote'}
              </DropdownMenuLabel>
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
