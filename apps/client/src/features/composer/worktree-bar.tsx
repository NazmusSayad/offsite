import {
  CircleDashedIcon,
  GitBranchIcon,
  GitForkIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo, WorktreeStage } from '@offsite/core/git'
import type { RpcMethods } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logger } from '@/lib/log'
import { openSession } from '@/lib/sessions'
import { machineOf, update, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const log = logger.withTag('worktree')

export function WorktreeBar(props: { machine: string; projectId: string }) {
  const worktree = useStore((state) => state.worktree)
  const stage = useStore((state) => state.worktreeStage)
  const setup = useStore(
    (state) =>
      state.projects.find(
        (item) => item.machine === props.machine && item.id === props.projectId
      )?.worktreeSetup ?? null
  )
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
      <div className="composer-glass relative mx-auto -mt-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] items-center gap-0.5 rounded-b-2xl border border-t-0 border-(--composer-outline) px-1 pt-[calc(1rem+1px+0.25rem)] pb-1 text-xs/4">
        {stage !== null && (
          <span className="text-muted-foreground flex h-6 min-w-0 items-center gap-1.5 px-2">
            <HugeiconsIcon
              icon={CircleDashedIcon}
              className="size-3.5 shrink-0 animate-spin"
            />
            <span className="truncate">{stageText(stage, setup)}</span>
          </span>
        )}
        {stage === null && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'text-muted-foreground hover:text-foreground flex h-6 max-w-56 cursor-pointer items-center gap-1.5 rounded-full px-2 outline-none',
                    worktree === null && 'text-foreground bg-foreground/[0.07]'
                  )}
                  title="Choose where the agent works"
                >
                  <HugeiconsIcon
                    icon={GitBranchIcon}
                    className="size-3.5 shrink-0"
                  />
                  <span className="truncate">{repo.branch ?? 'Detached'}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
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
              title="Pull main and start in a new worktree"
              onClick={() => update({ worktree: worktree ?? '' })}
            >
              <HugeiconsIcon icon={GitForkIcon} className="size-3.5 shrink-0" />
              New worktree
            </button>
            {worktree !== null && (
              <input
                value={worktree}
                placeholder="Name, or leave empty to name it from the prompt"
                spellCheck={false}
                className="placeholder:text-muted-foreground/70 h-6 min-w-0 flex-1 bg-transparent px-2 outline-none"
                onChange={(event) => update({ worktree: event.target.value })}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function WorktreeMenu(props: { machine: string; projectId: string }) {
  const [worktrees, setWorktrees] = useState<
    RpcMethods['projects.worktrees']['result'] | null
  >(null)

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
      {worktrees.map((item) => (
        <DropdownMenuRadioItem
          key={item.projectId}
          value={item.projectId}
          onSelect={() =>
            openSession({
              machine: props.machine,
              projectId: item.projectId,
              sessionId: null,
            })
          }
        >
          <span className="min-w-0 flex-1 truncate">
            {item.branch ?? 'Detached'}
          </span>
          <span className="text-muted-foreground text-xs">
            {item.worktree ? 'Worktree' : 'Project folder'}
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function stageText(stage: WorktreeStage, setup: string | null) {
  switch (stage) {
    case 'pull':
      return 'Pulling main…'
    case 'create':
      return 'Creating the worktree…'
    case 'setup':
      if (setup === null) {
        throw new Error('This project has no worktree setup command')
      }
      return `Running ${setup}…`
  }
}
