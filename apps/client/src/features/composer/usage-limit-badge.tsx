import { LimitationIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { UsageDetails } from '@/features/usage/usage-meters'
import { useSelectedAccount, useUsage } from '@/lib/usage'
import { windowName } from './limits'

export function UsageLimitBadge() {
  const selected = useSelectedAccount()
  const limit = useUsage(selected.machine, selected.account)
    ?.limits.filter(
      (item) =>
        !item.rejected && item.utilization !== null && item.utilization >= 0.9
    )
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))[0]

  if (
    limit === undefined ||
    selected.machine === null ||
    selected.account === undefined
  ) {
    return null
  }

  const used = `${Math.round((limit.utilization ?? 0) * 100)}%`

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <span
          className="bg-warning/15 text-warning-foreground flex h-5 shrink-0 items-center gap-0.75 rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums"
          aria-label={`${windowName(limit)} limit ${used} used`}
        >
          <HugeiconsIcon icon={LimitationIcon} className="size-3 shrink-0" />
          {used}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        className="pointer-events-none w-80 p-0"
      >
        <UsageDetails machine={selected.machine} account={selected.account} />
      </HoverCardContent>
    </HoverCard>
  )
}
