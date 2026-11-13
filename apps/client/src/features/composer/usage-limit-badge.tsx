import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { leftOf, UsageDetails, UsageMeter } from '@/features/usage/usage-meters'
import { useSelectedAccount, useUsage } from '@/lib/usage'

export function UsageLimitBadge() {
  const selected = useSelectedAccount()
  const usage = useUsage(selected.machine, selected.account)
  const session = leftOf(usage, 'five_hour')
  const weekly = leftOf(usage, 'seven_day')

  if (
    selected.machine === null ||
    selected.account === undefined ||
    ((session === null || session >= 10) && (weekly === null || weekly >= 10))
  ) {
    return null
  }

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <span className="shrink-0">
          <UsageMeter
            machine={selected.machine}
            account={selected.account}
            icon={false}
          />
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
