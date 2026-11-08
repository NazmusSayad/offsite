import { GitBranchIcon, GitForkIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { showError, update, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function WorktreeBar(props: { machine: string; projectId: string }) {
  const worktree = useStore((state) => state.worktree)
  const [repos, setRepos] = useState<GitRepo[] | null>(null)
  const repo = repos?.find((item) => item.path === '')

  useEffect(() => {
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
        if (current) {
          showError(error)
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.projectId])

  if (repo === undefined) {
    return null
  }

  return (
    <div className="absolute inset-x-0 top-full flex items-center gap-1 px-2 pt-2.5 text-xs sm:px-2.5">
      <button
        className={cn(
          'text-muted-foreground hover:text-foreground flex h-7 max-w-56 cursor-pointer items-center gap-1.5 rounded-full px-2.5',
          worktree === null && 'text-foreground bg-foreground/[0.07]'
        )}
        title="Work in the current checkout"
        onClick={() => update({ worktree: null })}
      >
        <HugeiconsIcon icon={GitBranchIcon} className="size-3.5 shrink-0" />
        <span className="truncate">{repo.branch ?? 'Detached'}</span>
      </button>
      <button
        className={cn(
          'text-muted-foreground hover:text-foreground flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5',
          worktree !== null && 'text-foreground bg-foreground/[0.07]'
        )}
        title="Start from the latest main branch in a new worktree"
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
          className="placeholder:text-muted-foreground/70 border-border/70 focus:border-ring ms-1 h-7 min-w-0 flex-1 border-b bg-transparent outline-none"
          onChange={(event) => update({ worktree: event.target.value })}
        />
      )}
    </div>
  )
}
