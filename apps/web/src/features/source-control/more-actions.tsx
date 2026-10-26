import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  GitAction,
  GitResource,
  SourceControlRepo,
} from '@offsite/core/git'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { EditorSettings } from '@/features/files/editor-state'
import {
  type CommitOptions,
  commitDefaults,
} from '@/features/source-control/commit-box'

export function MoreActions(props: {
  repo: SourceControlRepo
  settings: EditorSettings
  onSettings: (change: Partial<EditorSettings>) => void
  onCommit: (options: CommitOptions) => void
  onUndo: () => void
  onRun: (action: GitAction) => void
  onRemote: (method: 'git.push' | 'git.sync') => void
  onStage: (resources: GitResource[]) => void
  onUnstage: (resources: GitResource[]) => void
  onDiscard: (resources: GitResource[]) => void
  onCheckout: () => void
}) {
  const repo = props.repo

  function commitItem(label: string, change: Partial<CommitOptions>) {
    return (
      <DropdownMenuItem
        onSelect={() => props.onCommit({ ...commitDefaults, ...change })}
      >
        {label}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-micro"
          variant="ghost"
          title="More Actions..."
          aria-label="More Actions"
          onClick={(event) => event.stopPropagation()}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover! w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>View & Sort</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            <DropdownMenuRadioGroup
              value={props.settings.tree ? 'tree' : 'list'}
              onValueChange={(value) =>
                props.onSettings({ tree: value === 'tree' })
              }
            >
              <DropdownMenuRadioItem value="list">
                View as List
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tree">
                View as Tree
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={props.settings.sort}
              onValueChange={(value) => {
                if (
                  value === 'name' ||
                  value === 'path' ||
                  value === 'status'
                ) {
                  props.onSettings({ sort: value })
                }
              }}
            >
              <DropdownMenuRadioItem value="name">
                Sort by Name
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="path">
                Sort by Path
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status">
                Sort by Status
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => props.onRun({ kind: 'pull', rebase: false })}
        >
          Pull
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onRemote('git.push')}>
          Push
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onCheckout}>
          Checkout to...
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            props.onRun({ kind: 'fetch', prune: false, all: false })
          }
        >
          Fetch
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Commit</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            {commitItem('Commit', {})}
            {commitItem('Commit Staged', { all: false })}
            {commitItem('Commit All', { all: true })}
            <DropdownMenuItem
              disabled={repo.head === null}
              onSelect={props.onUndo}
            >
              Undo Last Commit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {commitItem('Commit (Amend)', { amend: true })}
            {commitItem('Commit Staged (Amend)', { all: false, amend: true })}
            {commitItem('Commit All (Amend)', { all: true, amend: true })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Changes</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem
              onSelect={() => props.onStage([...repo.merge, ...repo.changes])}
            >
              Stage All Changes
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onUnstage(repo.staged)}>
              Unstage All Changes
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={repo.changes.length === 0}
              onSelect={() => props.onDiscard(repo.changes)}
            >
              Discard All Changes
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Pull, Push</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem onSelect={() => props.onRemote('git.sync')}>
              Sync
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'pull', rebase: false })}
            >
              Pull
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'pull', rebase: true })}
            >
              Pull (Rebase)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => props.onRemote('git.push')}>
              Push
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                props.onRun({ kind: 'fetch', prune: false, all: false })
              }
            >
              Fetch
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                props.onRun({ kind: 'fetch', prune: true, all: false })
              }
            >
              Fetch (Prune)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                props.onRun({ kind: 'fetch', prune: false, all: true })
              }
            >
              Fetch From All Remotes
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Branch</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem onSelect={props.onCheckout}>
              Create Branch...
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={repo.branch === null || repo.upstream !== null}
              onSelect={() => props.onRemote('git.push')}
            >
              Publish Branch...
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Stash</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'stash', mode: 'tracked' })}
            >
              Stash
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'stash', mode: 'untracked' })}
            >
              Stash (Include Untracked)
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'stash', mode: 'staged' })}
            >
              Stash Staged
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'unstash', pop: false })}
            >
              Apply Latest Stash
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => props.onRun({ kind: 'unstash', pop: true })}
            >
              Pop Latest Stash
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
