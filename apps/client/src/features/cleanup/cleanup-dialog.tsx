import type { CleanupItem } from '@offsite/core/cleanup'
import { useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fileSize, projectName } from '@/lib/format'
import { showError, useStore } from '@/lib/store'

const DAY = 86_400_000

export function CleanupDialog(props: { onClose: () => void }) {
  const machines = useStore((state) => state.machines)
  const [skipped, setSkipped] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const now = Date.now()
  const groups = machines.flatMap((machine) =>
    machine.status === 'online' &&
    machine.cleanup !== null &&
    machine.cleanup.items.length > 0
      ? [{ machine, items: machine.cleanup.items }]
      : []
  )
  const unreachable = machines.filter((machine) => machine.status !== 'online')
  const selected = groups.map((group) => ({
    machine: group.machine.id,
    items: group.items.filter(
      (item) => !skipped.includes(`${group.machine.id}\n${item.id}`)
    ),
  }))
  const selectedBytes = selected
    .flatMap((group) => group.items)
    .reduce((total, item) => total + item.bytes, 0)

  async function remove() {
    setDeleting(true)
    const results = await Promise.allSettled(
      selected
        .filter((group) => group.items.length > 0)
        .map((group) =>
          call(group.machine, 'cleanup.run', {
            ids: group.items.map((item) => item.id),
          })
        )
    )
    setDeleting(false)
    for (const result of results) {
      if (result.status === 'rejected') {
        showError(result.reason)
      }
    }
    if (results.every((result) => result.status === 'fulfilled')) {
      props.onClose()
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Clean up</DialogTitle>
      </DialogHeader>
      {groups.length === 0 && (
        <p className="text-muted-foreground">Nothing to clean up.</p>
      )}
      {groups.length > 0 && (
        <div className="-mx-5 flex max-h-[60dvh] flex-col gap-4 overflow-y-auto px-3">
          {groups.map((group) => (
            <section key={group.machine.id} className="flex flex-col gap-0.5">
              <h3 className="text-muted-foreground flex justify-between gap-3 px-2 text-xs font-medium">
                <span className="truncate">{group.machine.name}</span>
                <span className="shrink-0 tabular-nums">
                  {fileSize(
                    group.items.reduce((total, item) => total + item.bytes, 0)
                  )}
                </span>
              </h3>
              {group.items.map((item) => {
                const key = `${group.machine.id}\n${item.id}`
                const loss = itemLoss(item)
                return (
                  <label
                    key={item.id}
                    className="hover:bg-accent flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.75 shrink-0"
                      disabled={deleting}
                      checked={!skipped.includes(key)}
                      onChange={(event) =>
                        setSkipped(
                          event.target.checked
                            ? skipped.filter((entry) => entry !== key)
                            : [...skipped, key]
                        )
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {itemName(item)}
                      </span>
                      <span className="text-muted-foreground text-xs wrap-anywhere">
                        {itemDetail(item, now)}
                      </span>
                      {loss !== null && (
                        <span className="text-warning-foreground text-xs">
                          {loss}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {fileSize(item.bytes)}
                    </span>
                  </label>
                )
              })}
            </section>
          ))}
        </div>
      )}
      {unreachable.length > 0 && (
        <p className="text-muted-foreground text-xs wrap-anywhere">
          Unreachable: {unreachable.map((machine) => machine.name).join(', ')}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">
            {groups.length === 0 ? 'Close' : 'Cancel'}
          </Button>
        </DialogClose>
        {groups.length > 0 && (
          <Button
            variant="destructive"
            disabled={
              deleting || selected.every((group) => group.items.length === 0)
            }
            onClick={() => void remove()}
          >
            {deleting ? 'Deleting' : `Delete ${fileSize(selectedBytes)}`}
          </Button>
        )}
      </DialogFooter>
    </>
  )
}

function itemName(item: CleanupItem) {
  switch (item.kind) {
    case 'worktree':
      return item.branch ?? projectName(item.folder)
    case 'chat':
      return item.title ?? 'Chat'
    case 'uploads':
      return 'Uploaded files'
    case 'pasted':
      return 'Images pasted into the terminal'
    case 'logs':
      return 'Log folders'
    case 'generations':
      return 'AI-written text log'
    case 'reviewGuides':
      return 'Pull request review guides'
  }
}

function itemDetail(item: CleanupItem, now: number) {
  switch (item.kind) {
    case 'worktree':
      return [
        item.project ?? projectName(item.folder.replace(/[\\/][^\\/]+$/, '')),
        item.reason === 'merged'
          ? `Merged ${days(now - item.since)} ago`
          : `${item.reason === 'pushed' ? 'Pushed' : 'Not pushed'}, unchanged for ${days(now - item.since)}`,
      ].join(' · ')
    case 'chat':
      return `Chat without a project · Last used ${days(now - item.since)} ago`
    case 'uploads':
      return `${plural(item.count, 'file')} older than 30 days`
    case 'pasted':
      return `${plural(item.count, 'image')} older than 1 day`
    case 'logs':
      return `${plural(item.count, 'folder')} older than 30 days`
    case 'generations':
      return `${plural(item.count, 'entry', 'entries')} older than 30 days`
    case 'reviewGuides':
      return `${plural(item.count, 'guide')} older than 30 days`
  }
}

function itemLoss(item: CleanupItem) {
  if (item.kind !== 'worktree') {
    return null
  }
  const lost = [
    item.changes > 0 && plural(item.changes, 'uncommitted change'),
    item.branch === null &&
      item.commits > 0 &&
      `${plural(item.commits, 'commit')} on no branch`,
  ].filter((entry) => entry !== false)
  return lost.length === 0 ? null : `Loses ${lost.join(' and ')}`
}

function days(ms: number) {
  return plural(Math.floor(ms / DAY), 'day')
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}
