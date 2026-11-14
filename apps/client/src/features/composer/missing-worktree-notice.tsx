import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { openSession } from '@/lib/sessions'
import { projectOf, showError, update, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

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
  const online = useStore(
    (state) =>
      state.machines.find((item) => item.id === state.selection?.machine)
        ?.status === 'online'
  )
  const [switching, setSwitching] = useState(false)
  const machine = selection?.machine ?? null
  const worktreeId =
    project !== undefined && project.parentId !== null ? project.id : null

  useEffect(() => {
    if (machine === null || worktreeId === null || !online) {
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
  }, [machine, worktreeId, online, props.running])

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

  const detail =
    known.state === 'folderMissing'
      ? 'folder will be created'
      : project.worktreeBranch !== null
        ? 'branch and folder will be created'
        : null
  const canSwitch =
    known.state === 'branchMissing' &&
    session !== undefined &&
    session.provider === 'claude'

  async function switchToMain() {
    if (machine === null || session === undefined) {
      return
    }
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
  }

  return (
    <div className="composer-glass @container relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 border-(--composer-outline) px-3 pt-2 pb-[calc(1rem+1px+0.5rem)] text-xs/4">
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5">
        <HugeiconsIcon
          icon={WorktreeIcon}
          className="text-warning-foreground size-3.5 shrink-0"
        />
        <span className="text-foreground/90 font-medium">Worktree missing</span>
        {detail !== null && (
          <span
            className={cn(
              'text-secondary-label',
              canSwitch &&
                '@max-md:order-last @max-md:basis-full @max-md:pl-5.5'
            )}
          >
            <span className={cn(canSwitch && '@max-md:hidden')}>· </span>
            {detail}
          </span>
        )}
        {canSwitch && (
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            disabled={switching || props.running}
            title="Continue this chat in the main project folder"
            onClick={() => void switchToMain()}
          >
            Switch to main
          </Button>
        )}
      </div>
    </div>
  )
}
