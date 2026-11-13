import {
  FolderGit2Icon,
  GitBranchIcon,
  GitBranchPlusIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { WorktreeChoice } from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { timeAgo } from '@/lib/format'
import { logger } from '@/lib/log'
import { openSession } from '@/lib/sessions'
import { update, useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

const log = logger.withTag('worktree')

const NEW_WORKTREE = 'new-worktree'

export function LocationMenu(props: {
  machine: string
  projectId: string
  onRefresh: () => void
}) {
  const worktree = useStore((state) => state.worktree)
  const [found, setFound] = useState<{
    worktrees: WorktreeChoice[]
    branches: string[]
  } | null>(null)

  useEffect(() => {
    let current = true
    async function load() {
      try {
        const [worktrees, branches] = await Promise.all([
          call(props.machine, 'projects.worktrees', {
            projectId: props.projectId,
          }),
          call(props.machine, 'git.localBranches', {
            projectId: props.projectId,
            repo: '',
          }),
        ])
        if (current) {
          setFound({
            worktrees,
            branches: branches
              .filter((branch) => branch.local)
              .map((branch) => branch.name),
          })
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

  if (found === null) {
    return <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
  }

  const main = found.worktrees.find((item) => !item.worktree)
  if (main === undefined || main.projectId === null) {
    return (
      <DropdownMenuItem disabled>
        Could not find the main checkout
      </DropdownMenuItem>
    )
  }
  const rootId = main.projectId
  const worktrees = found.worktrees
    .filter((item) => item.worktree)
    .sort((a, b) => b.activeAt - a.activeAt)
  const branches = found.branches.filter(
    (name) =>
      name !== main.branch && !worktrees.some((item) => item.branch === name)
  )

  return (
    <DropdownMenuRadioGroup
      value={worktree === null ? props.projectId : NEW_WORKTREE}
    >
      <DropdownMenuRadioItem
        value={rootId}
        onSelect={() => {
          if (rootId === props.projectId) {
            update({ worktree: null })
            return
          }
          void openWorktree(props.machine, props.projectId, main)
        }}
      >
        <HugeiconsIcon
          icon={GitBranchIcon}
          className="text-muted-foreground size-3.5"
        />
        <span className="min-w-0 flex-1 truncate">
          {main.branch ?? 'Detached HEAD'}
        </span>
      </DropdownMenuRadioItem>
      {branches.map((name) => (
        <DropdownMenuRadioItem
          key={name}
          value={`branch:${name}`}
          onSelect={() =>
            void switchMain(props.machine, props.projectId, rootId, name).then(
              props.onRefresh
            )
          }
        >
          <HugeiconsIcon
            icon={GitBranchIcon}
            className="text-muted-foreground size-3.5"
          />
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </DropdownMenuRadioItem>
      ))}
      <DropdownMenuSeparator />
      {worktrees.length > 0 && (
        <>
          {worktrees.map((item) => (
            <DropdownMenuRadioItem
              key={item.folder}
              value={item.projectId ?? item.folder}
              onSelect={() => {
                if (item.projectId === props.projectId) {
                  update({ worktree: null })
                  return
                }
                void openWorktree(props.machine, props.projectId, item)
              }}
            >
              <HugeiconsIcon
                icon={FolderGit2Icon}
                className="text-muted-foreground size-3.5"
              />
              <span className="min-w-0 flex-1 truncate">
                {item.branch ?? 'Detached HEAD'}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {timeAgo(item.activeAt)}
              </span>
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
        </>
      )}
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

async function switchMain(
  machine: string,
  projectId: string,
  rootId: string,
  branch: string
) {
  try {
    await call(machine, 'git.switch', {
      projectId: rootId,
      repo: '',
      branch,
      create: false,
    })
    if (rootId === projectId) {
      update({ worktree: null })
      return
    }
    openSession({ machine, projectId: rootId, sessionId: null, pending: null })
  } catch (error) {
    log.error('could not switch the branch', error)
    toast(errorMessage(error))
  }
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
    openSession({ machine, projectId: id, sessionId: null, pending: null })
  } catch (error) {
    log.error('could not open the worktree', error)
    toast(errorMessage(error))
  }
}
