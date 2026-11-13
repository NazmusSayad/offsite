import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { UsageDetails, UsageMeter } from '@/features/usage/usage-meters'
import { usageMeter, useSelectedAccount, useUsage } from '@/lib/usage'

export function UsageLimitBadge() {
  const selected = useSelectedAccount()
  const usage = useUsage(selected.machine, selected.account)
  const { short, long } = usageMeter(usage)

  if (
    selected.machine === null ||
    selected.account === undefined ||
    ((short === null || short >= 10) && (long === null || long >= 10))
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
