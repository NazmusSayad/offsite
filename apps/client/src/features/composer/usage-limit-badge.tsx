import { LimitationIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSelectedUsage } from '@/lib/usage'
import { windowName } from './limits'

export function UsageLimitBadge() {
  const limit = useSelectedUsage()
    ?.limits.filter(
      (item) =>
        !item.rejected && item.utilization !== null && item.utilization >= 0.9
    )
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))[0]

  if (limit === undefined) {
    return null
  }

  const used = `${Math.round((limit.utilization ?? 0) * 100)}%`
  const label = `${windowName(limit)} limit ${used} used`

  return (
    <span
      className="bg-warning/15 text-warning-foreground flex h-5 shrink-0 items-center gap-0.75 rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums"
      title={label}
      aria-label={label}
    >
      <HugeiconsIcon icon={LimitationIcon} className="size-3 shrink-0" />
      {used}
    </span>
  )
}
