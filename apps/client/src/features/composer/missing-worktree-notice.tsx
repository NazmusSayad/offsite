import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { openSession } from '@/lib/sessions'
import { projectOf, showError, update, useStore } from '@/lib/store'

export function MissingWorktreeNotice(props: { running: boolean }) {
  const selection = useStore((state) => state.selection)
  const project = useStore((state) =>
    state.selection === null
      ? undefined
      : projectOf(state, state.selection.machine, state.selection.projectId)
  )
  const session = useStore((state) =>
    state.sessions.find(
      (item) =>
        item.machine === state.selection?.machine &&
        item.id === state.selection.sessionId
    )
  )
  const known = useStore((state) => state.worktreeState)
  const [switching, setSwitching] = useState(false)
  const machine = selection?.machine ?? null
  const worktreeId =
    project !== undefined && project.parentId !== null ? project.id : null

  useEffect(() => {
    if (machine === null || worktreeId === null) {
      update({ worktreeState: null })
      return
    }
    const target = { machine, projectId: worktreeId }
    let current = true
    async function refresh() {
      try {
        const state = await call(target.machine, 'projects.worktreeState', {
          projectId: target.projectId,
        })
        if (current) {
          update({ worktreeState: { ...target, state } })
        }
      } catch (error) {
        if (current) {
          showError(error)
        }
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.removeEventListener('focus', refresh)
    }
  }, [machine, worktreeId, props.running])

  if (
    known === null ||
    machine === null ||
    project === undefined ||
    known.machine !== machine ||
    known.projectId !== project.id ||
    known.state === 'ready'
  ) {
    return null
  }

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-t-2xl border border-b-0 border-(--composer-outline) px-3 pt-2 pb-[calc(1rem+1px+0.5rem)] text-xs/4">
      <HugeiconsIcon
        icon={Alert02Icon}
        className="text-warning-foreground size-3.5 shrink-0"
      />
      <span className="text-secondary-label min-w-0 flex-1">
        {known.state === 'folderMissing' && 'Worktree will be recreated'}
        {known.state === 'branchMissing' &&
          project.worktreeBranch !== null &&
          'Worktree will be created'}
        {known.state === 'branchMissing' &&
          project.worktreeBranch === null &&
          'Worktree is missing'}
      </span>
      {known.state === 'branchMissing' &&
        session !== undefined &&
        session.provider === 'claude' && (
          <Button
            size="xs"
            variant="ghost"
            disabled={switching || props.running}
            title="Continue this chat in the main project folder"
            onClick={async () => {
              setSwitching(true)
              try {
                const result = await call(machine, 'sessions.moveToMain', {
                  sessionId: session.id,
                })
                openSession({
                  machine,
                  projectId: result.projectId,
                  sessionId: session.id,
                  pending: null,
                })
              } catch (error) {
                showError(error)
              } finally {
                setSwitching(false)
              }
            }}
          >
            Switch to main
          </Button>
        )}
    </div>
  )
}
