import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { openSession } from '@/lib/sessions'
import { setDraft, useStore } from '@/lib/store'

export function ClaudeWorktreeNotice() {
  const session = useStore((state) =>
    state.sessions.find(
      (item) =>
        item.machine === state.selection?.machine &&
        item.id === state.selection.sessionId
    )
  )

  if (session === undefined || !session.claudeWorktree) {
    return null
  }

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-t-2xl border border-b-0 border-(--composer-outline) px-3 pt-2 pb-[calc(1rem+1px+0.5rem)] text-xs/4">
      <HugeiconsIcon
        icon={Alert02Icon}
        className="text-warning-foreground size-3.5 shrink-0"
      />
      <span className="text-secondary-label min-w-0 flex-1">
        Claude Code moved this chat into its own worktree. A Claude Code bug
        blocks shell commands there.
      </span>
      <Button
        size="xs"
        variant="ghost"
        title="Start a new chat in that worktree, where shell commands work"
        onClick={() =>
          openSession({
            machine: session.machine,
            projectId: session.projectId,
            sessionId: null,
            pending: null,
          })
        }
      >
        Continue in this worktree
      </Button>
      <Button
        size="xs"
        variant="ghost"
        title="Write a message that asks Claude to leave the worktree"
        onClick={() =>
          setDraft({
            text: 'Leave the worktree with ExitWorktree and keep working in the original folder.',
            images: [],
          })
        }
      >
        Ask Claude to leave
      </Button>
    </div>
  )
}
