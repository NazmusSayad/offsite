import type { Account, Usage } from '@offsite/core/providers'
import { useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import { useStore } from '@/lib/store'
import { hasUsage, usageKey, useUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'
import { AccountUsage } from './account-usage'

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

export function LastUsageMeter() {
  const machines = useStore((state) => state.machines)
  const last = machines
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
    .at(0)

  if (last === undefined) {
    return null
  }
  return (
    <UsageMeter
      machine={last.machine}
      account={last.account}
      icon
      className="ms-auto"
    />
  )
}

export function UsageMeter(props: {
  machine: string
  account: Account
  icon: boolean
  className?: string
}) {
  const usage = useUsage(props.machine, props.account)
  const session = leftOf(usage, 'five_hour') ?? leftOf(usage, 'seven_day')
  const weekly = leftOf(usage, 'seven_day') ?? leftOf(usage, 'five_hour')

  return (
    <span
      className={cn(
        'relative flex h-5 shrink-0 items-center gap-0.75 overflow-hidden rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums',
        (weekly === null || weekly >= 20) && 'bg-foreground/5',
        weekly !== null && weekly >= 10 && weekly < 20 && 'bg-error/5',
        weekly !== null && weekly < 10 && 'bg-error/15',
        (session === null || session >= 20) && 'text-muted-foreground',
        session !== null && session >= 10 && session < 20 && 'text-error/60',
        session !== null && session < 10 && 'text-error',
        props.className
      )}
      aria-label={`${props.account.name} usage`}
    >
      {weekly !== null && (
        <span
          className={cn(
            'absolute inset-y-0 left-0',
            weekly >= 20 && 'bg-foreground/8',
            weekly >= 10 && weekly < 20 && 'bg-error/8',
            weekly < 10 && 'bg-error/25'
          )}
          style={{ width: `${weekly}%` }}
        />
      )}
      {props.icon && (
        <ProviderIcon
          provider={props.account.provider}
          className={cn(
            'relative size-3 shrink-0',
            props.account.provider === 'claude' && 'fill-current'
          )}
        />
      )}
      <span className="relative">{session === null ? '–' : `${session}%`}</span>
    </span>
  )
}

export function leftOf(usage: Usage | undefined, window: string) {
  const limit = usage?.limits.find((item) => item.window === window)
  if (limit === undefined) {
    return null
  }
  if (limit.rejected) {
    return 0
  }
  if (limit.utilization === null) {
    return null
  }
  return Math.max(0, 100 - Math.round(limit.utilization * 100))
}
