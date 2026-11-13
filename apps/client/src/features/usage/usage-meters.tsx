import type { Account, Usage } from '@offsite/core/providers'
import { useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import { useStore } from '@/lib/store'
import { hasUsage, usageKey, useUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'
import { AccountUsage } from './account-usage'
import { claudeMeter } from './claude-usage'
import { codexMeter } from './codex-usage'

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
  const meter = usageMeter(usage, props.account.provider)
  const short = meter.short ?? meter.long
  const long = meter.long ?? meter.short

  return (
    <span
      className={cn(
        'relative flex h-5 shrink-0 items-center gap-0.75 overflow-hidden rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums',
        (long === null || long >= 20) && 'bg-foreground/5',
        long !== null && long >= 10 && long < 20 && 'bg-error/5',
        long !== null && long < 10 && 'bg-error/15',
        (short === null || short >= 20) && 'text-muted-foreground',
        short !== null && short >= 10 && short < 20 && 'text-error/60',
        short !== null && short < 10 && 'text-error',
        props.className
      )}
      aria-label={`${props.account.name} usage`}
    >
      {long !== null && (
        <span
          className={cn(
            'absolute inset-y-0 left-0',
            long >= 20 && 'bg-foreground/8',
            long >= 10 && long < 20 && 'bg-error/8',
            long < 10 && 'bg-error/25'
          )}
          style={{ width: `${long}%` }}
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
      <span className="relative">{short === null ? '–' : `${short}%`}</span>
    </span>
  )
}

export function usageMeter(
  usage: Usage | undefined,
  provider: Account['provider']
) {
  if (provider === 'claude') {
    return claudeMeter(usage)
  }
  if (provider === 'codex') {
    return codexMeter(usage)
  }
  throw new Error(`Unknown provider ${String(provider)}`)
}
