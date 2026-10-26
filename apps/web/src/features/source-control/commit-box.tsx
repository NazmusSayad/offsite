import {
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckIcon,
  CloudUploadIcon,
  RefreshIcon,
  SparklesIcon,
  StopCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SourceControlRepo } from '@offsite/core/git'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { shortHash } from '@/features/source-control/changes'
import { cn, mod } from '@/lib/utils'

export type CommitOptions = {
  all: boolean | null
  amend: boolean
  then: 'push' | 'sync' | null
}

export const commitDefaults: CommitOptions = {
  all: null,
  amend: false,
  then: null,
}

export function CommitBox(props: {
  repo: SourceControlRepo
  message: string
  generating: boolean
  busy: boolean
  nested: boolean
  onMessage: (message: string) => void
  onGenerate: () => void
  onCancel: () => void
  onCommit: (options: CommitOptions) => void
  onRemote: (method: 'git.push' | 'git.sync') => void
}) {
  const repo = props.repo
  const changed =
    repo.merge.length + repo.staged.length + repo.changes.length > 0
  const publish =
    !changed && repo.branch !== null && repo.upstream === null && repo.remote
  const sync =
    !changed && repo.upstream !== null && (repo.ahead > 0 || repo.behind > 0)

  return (
    <div
      className={cn(
        'grid gap-1.5 pt-1.5 pr-2 pb-1.5',
        props.nested ? 'pl-4' : 'pl-2'
      )}
    >
      <div className="bg-input/40 border-input focus-within:border-primary relative rounded-sm border">
        <textarea
          rows={7}
          aria-label="Source Control Input"
          value={props.message}
          placeholder={`Message (${mod === '⌘' ? '⌘Enter' : 'Ctrl+Enter'} to commit on "${repo.branch ?? (repo.head === null ? 'HEAD' : shortHash(repo.head))}")`}
          className="placeholder:text-muted-foreground block w-full resize-none bg-transparent py-1 pr-7 pl-2 text-[13px] leading-[18px] outline-none"
          onChange={(event) => props.onMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              props.onCommit({ ...commitDefaults, then: 'push' })
            }
          }}
        />
        <button
          type="button"
          title={props.generating ? 'Cancel' : 'Generate Commit Message'}
          aria-label={props.generating ? 'Cancel' : 'Generate Commit Message'}
          className="text-muted-foreground hover:text-foreground hover:bg-accent absolute top-[3px] right-[3px] grid size-5 cursor-pointer place-items-center rounded-sm"
          onClick={props.generating ? props.onCancel : props.onGenerate}
        >
          <HugeiconsIcon
            icon={props.generating ? StopCircleIcon : SparklesIcon}
            className="size-3.5"
          />
        </button>
      </div>
      {publish && (
        <Button
          size="xs"
          className="w-full rounded-sm"
          disabled={props.busy}
          onClick={() => props.onRemote('git.push')}
        >
          <HugeiconsIcon icon={CloudUploadIcon} />
          Publish Branch
        </Button>
      )}
      {sync && (
        <Button
          size="xs"
          className="w-full rounded-sm"
          disabled={props.busy}
          onClick={() => props.onRemote('git.sync')}
        >
          <HugeiconsIcon icon={RefreshIcon} />
          Sync Changes
          {repo.behind > 0 && (
            <span className="inline-flex items-center tabular-nums">
              {repo.behind}
              <HugeiconsIcon icon={ArrowDown02Icon} className="size-3" />
            </span>
          )}
          {repo.ahead > 0 && (
            <span className="inline-flex items-center tabular-nums">
              {repo.ahead}
              <HugeiconsIcon icon={ArrowUp02Icon} className="size-3" />
            </span>
          )}
        </Button>
      )}
      {!publish && !sync && (
        <div className="flex">
          <Button
            size="xs"
            className="flex-1 rounded-sm rounded-r-none"
            disabled={!changed || props.busy}
            onClick={() => props.onCommit({ ...commitDefaults, then: 'push' })}
          >
            <HugeiconsIcon icon={CheckIcon} />
            Commit & Push
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                className="rounded-sm rounded-l-none px-1 before:absolute before:inset-y-1 before:-left-px before:w-px before:bg-white/10"
                disabled={!changed || props.busy}
                title="More Actions..."
                aria-label="More Commit Actions"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover! w-48">
              <DropdownMenuItem onSelect={() => props.onCommit(commitDefaults)}>
                Commit
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  props.onCommit({ ...commitDefaults, amend: true })
                }
              >
                Commit (Amend)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  props.onCommit({ ...commitDefaults, then: 'push' })
                }
              >
                Commit & Push
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  props.onCommit({ ...commitDefaults, then: 'sync' })
                }
              >
                Commit & Sync
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
