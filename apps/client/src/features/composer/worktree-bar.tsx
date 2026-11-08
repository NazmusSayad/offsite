import { GitBranchIcon, GitForkIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { machineOf, showError, update, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function WorktreeBar(props: { machine: string; projectId: string }) {
  const worktree = useStore((state) => state.worktree)
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
        if (current) {
          showError(error)
        }
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
        <button
          className={cn(
            'text-muted-foreground hover:text-foreground flex h-6 max-w-56 cursor-pointer items-center gap-1.5 rounded-full px-2',
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
      </div>
    </div>
  )
}
