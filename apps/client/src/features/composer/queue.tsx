import {
  ArrowUp02Icon,
  ListPlusIcon,
  TimerResetIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { Button } from '@/components/ui/button'
import { usageRows } from '@/features/usage/usage-meters'
import { timeLeft } from '@/lib/format'
import { selectedPrompts, savedOutbox } from '@/lib/outbox'
import { steer, unqueue } from '@/lib/sessions'
import { selectedRunning, useStore } from '@/lib/store'
import { useSelectedUsage } from '@/lib/usage'

export function QueuedMessages() {
  const saved = useStore(savedOutbox)
  const rows = useStore(useShallow(selectedPrompts)).filter(
    (item) => item.status === 'queued'
  )

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 border-(--composer-outline) px-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4">
      {rows.map((item) => (
        <div
          key={item.id}
          className="grid min-h-6 grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-1"
        >
          <HugeiconsIcon
            icon={ListPlusIcon}
            className="text-muted-foreground mx-auto size-3"
          />
          <span className="text-secondary-label truncate">
            {item.prompt.text === ''
              ? `${item.prompt.images.length} image(s)`
              : item.prompt.text}
          </span>
          {saved.some((other) => other.id === item.id) && (
            <>
              <Button
                variant="ghost-muted"
                size="icon-micro"
                title="Send now"
                onClick={() => steer(item.id)}
              >
                <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
              </Button>
              <Button
                variant="ghost-muted"
                size="icon-micro"
                title="Remove from queue"
                onClick={() => unqueue(item.id)}
              >
                <HugeiconsIcon icon={XIcon} className="size-4" />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function UsageResetBanner() {
  const running = useStore(selectedRunning)
  const usage = useSelectedUsage()
  const limit = running
    ? usageRows(usage)
        .flatMap((row) => (row.limit === null ? [] : [row.limit]))
        .find((item) => item.rejected)
    : undefined
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (limit === undefined) {
      return
    }
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [limit])

  if (limit === undefined) {
    return null
  }

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] items-center gap-2 rounded-t-2xl border border-b-0 border-(--composer-outline) px-3 pt-2 pb-[calc(1rem+1px+0.5rem)] text-xs/4">
      <HugeiconsIcon
        icon={TimerResetIcon}
        className="text-warning-foreground size-3.5 shrink-0"
      />
      <span className="text-secondary-label truncate">
        {limit.resetsAt === null
          ? 'Usage limit reached'
          : `Usage limit reached · Resets in ${timeLeft(limit.resetsAt * 1000 - now)}`}
      </span>
    </div>
  )
}
