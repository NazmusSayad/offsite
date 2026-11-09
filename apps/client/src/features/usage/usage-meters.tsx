import type { Account, Usage } from '@offsite/core/providers'
import { uniqBy } from 'es-toolkit'
import { type CSSProperties, useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { type Machine, showUsage, useStore } from '@/lib/store'
import { hasUsage, usageKey, useUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'
import { AccountUsage, usageColor } from './account-usage'

export function UsageMeters() {
  const machines = useStore((state) => state.machines)
  const recent = recentAccounts(machines)

  if (recent.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1">
      {recent.map((entry, index) => (
        <UsageMeter
          key={usageKey(entry.machine, entry.account)}
          machine={entry.machine}
          account={entry.account}
          className={cn(index === 1 && '@max-[13rem]:hidden')}
        />
      ))}
    </div>
  )
}

function UsageMeter(props: {
  machine: string
  account: Account
  className: string
}) {
  const usage = useUsage(props.machine, props.account)
  const left = usage === undefined ? null : leftOf(usage)
  const critical = left !== null && left < 10
  const low = left !== null && left >= 10 && left < 20
  const normal = left === null || left >= 20

  return (
    <HoverCard openDelay={150} closeDelay={50}>
      <HoverCardTrigger asChild>
        <button
          className={cn(
            'group/usage relative flex h-5 shrink-0 cursor-pointer items-center gap-0.75 overflow-hidden rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums',
            normal && 'bg-foreground/5 text-muted-foreground',
            low && 'bg-error/5 text-error/60',
            critical && 'bg-error/15 text-error',
            left !== null &&
              'hover:bg-(--usage-color)/10 hover:text-(--usage-color) data-[state=open]:bg-(--usage-color)/10 data-[state=open]:text-(--usage-color)',
            props.className
          )}
          style={
            left === null
              ? undefined
              : ({ '--usage-color': usageColor(left) } as CSSProperties)
          }
          aria-label={`${props.account.name} usage`}
          onClick={() => showUsage(true)}
        >
          {left !== null && (
            <span
              className={cn(
                'absolute inset-y-0 left-0 group-hover/usage:bg-(--usage-color)/20 group-data-[state=open]/usage:bg-(--usage-color)/20',
                normal && 'bg-foreground/8',
                low && 'bg-error/8',
                critical && 'bg-error/25'
              )}
              style={{ width: `${left}%` }}
            />
          )}
          <ProviderIcon
            provider={props.account.provider}
            className={cn(
              'relative size-3 shrink-0',
              props.account.provider === 'claude' && 'fill-current'
            )}
          />
          <span className="relative">{left === null ? '–' : `${left}%`}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="end"
        className="pointer-events-none w-80 p-0"
      >
        <UsageDetails machine={props.machine} account={props.account} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function UsageDetails(props: { machine: string; account: Account }) {
  const machines = useStore((state) => state.machines)
  const [now] = useState(() => Date.now())
  const key = usageKey(props.machine, props.account)
  const shared = machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) =>
      [...machine.claudeAccounts, ...machine.codexAccounts]
        .filter(
          (account) =>
            hasUsage(account) && usageKey(machine.id, account) === key
        )
        .map((account) => ({ machine, account }))
    )

  return (
    <ul>
      <AccountUsage
        machine={props.machine}
        account={props.account}
        machines={shared.map((entry) => entry.machine)}
        names={shared.map((entry) => entry.account.name)}
        now={now}
        refreshable={false}
        className="px-3.5 py-3"
      />
    </ul>
  )
}

function leftOf(usage: Usage) {
  const lefts = usage.limits
    .filter((limit) => limit.rejected || limit.utilization !== null)
    .map((limit) =>
      limit.rejected
        ? 0
        : Math.max(0, 100 - Math.round((limit.utilization ?? 0) * 100))
    )
  return lefts.length === 0 ? null : Math.min(...lefts)
}

function recentAccounts(machines: Machine[]) {
  const used = machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) =>
      machine.lastMessageAtByAccount.flatMap((row) => {
        const account = [
          ...machine.claudeAccounts,
          ...machine.codexAccounts,
        ].find((item) => item.id === row.accountId)
        return account === undefined || !hasUsage(account)
          ? []
          : [{ machine: machine.id, account, sentAt: row.sentAt }]
      })
    )
    .sort((a, b) => b.sentAt - a.sentAt)
  return uniqBy(used, (entry) => usageKey(entry.machine, entry.account)).slice(
    0,
    2
  )
}
