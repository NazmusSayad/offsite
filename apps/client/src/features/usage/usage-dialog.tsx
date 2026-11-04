import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account } from '@offsite/core/providers'
import { Fragment, useEffect, useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { MachineLogo } from '@/constants/machine-icons'
import { windowName } from '@/features/composer/limits'
import { fullTime, timeAgo, timeLeft } from '@/lib/format'
import { type Machine, showUsage, useStore } from '@/lib/store'
import { hasUsage, loadUsage, usageKey, useUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'

export function UsageDialog() {
  const open = useStore((state) => state.usageOpen)

  return (
    <Dialog open={open} onOpenChange={showUsage}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-5 pt-4 pr-12 pb-3">
          <DialogTitle>Usage</DialogTitle>
        </DialogHeader>
        <UsageList />
      </DialogContent>
    </Dialog>
  )
}

function UsageList() {
  const machines = useStore((state) => state.machines)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const online = machines.filter((machine) => machine.status === 'online')
  const groups = new Map<
    string,
    { machine: string; account: Account; machines: Machine[] }
  >()
  for (const entry of [
    ...online.flatMap((machine) => accountsOf(machine, machine.claudeAccounts)),
    ...online.flatMap((machine) => accountsOf(machine, machine.codexAccounts)),
  ]) {
    if (!hasUsage(entry.account)) {
      continue
    }
    const key = usageKey(entry.machine.id, entry.account)
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, {
        machine: entry.machine.id,
        account: entry.account,
        machines: [entry.machine],
      })
    } else {
      group.machines.push(entry.machine)
    }
  }

  if (groups.size === 0) {
    return (
      <p className="text-muted-foreground border-t px-5 py-8 text-center text-xs">
        No Claude or Codex accounts with plan limits
      </p>
    )
  }

  return (
    <ul className="max-h-[70dvh] divide-y overflow-y-auto border-t">
      {[...groups].map((entry) => (
        <AccountUsage
          key={entry[0]}
          machine={entry[1].machine}
          account={entry[1].account}
          machines={entry[1].machines}
          now={now}
        />
      ))}
    </ul>
  )
}

function AccountUsage(props: {
  machine: string
  account: Account
  machines: Machine[]
  now: number
}) {
  const account = props.account
  const usage = useUsage(props.machine, account)
  const limits =
    usage?.limits.filter(
      (limit) => limit.rejected || limit.utilization !== null
    ) ?? []
  const updatedAt = usage?.updatedAt ?? usage?.fetchedAt ?? null
  const ago = updatedAt === null ? null : timeAgo(updatedAt)
  const [refreshing, setRefreshing] = useState(false)
  const loading = refreshing || usage === undefined

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ProviderIcon
            provider={account.provider}
            className="size-3.5 shrink-0"
          />
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5',
              loading && 'text-shimmer'
            )}
          >
            <span
              className="truncate font-medium"
              style={
                loading
                  ? undefined
                  : { color: providerColors[account.provider] }
              }
            >
              {accountLabel(account)}
            </span>
            {account.plan !== null && (
              <span
                className={cn('shrink-0', !loading && 'text-muted-foreground')}
              >
                · {planName(account.provider, account.plan)}
              </span>
            )}
          </span>
          <span className="bg-foreground/5 ml-1 flex shrink-0 items-center gap-1 rounded-full border px-1 py-0.5">
            {props.machines.map((machine) => (
              <Tooltip key={machine.id} label={machine.name}>
                <span className="text-icon-muted">
                  <MachineLogo icon={machine.icon} className="size-3" />
                </span>
              </Tooltip>
            ))}
          </span>
        </div>
        <Button
          variant="ghost-muted"
          size="xs"
          className="text-muted-foreground/70 -mr-2 h-6 shrink-0 gap-1.5 text-[11px] font-normal tabular-nums [&_svg]:mx-0"
          title="Refresh"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            await loadUsage(props.machine, account, true)
            setRefreshing(false)
          }}
        >
          {ago !== null && (ago === 'now' ? 'now' : `${ago} ago`)}
          <HugeiconsIcon
            icon={RefreshIcon}
            className={cn('size-3', loading && 'animate-spin')}
          />
        </Button>
      </div>
      {limits.length > 0 && (
        <div className="grid grid-cols-[minmax(2.5rem,max-content)_minmax(0,1fr)_2.25rem_3.25rem] items-center gap-x-3 gap-y-2 text-xs">
          {limits.map((limit) => {
            const left = limit.rejected
              ? 0
              : Math.max(0, 100 - Math.round((limit.utilization ?? 0) * 100))
            return (
              <Fragment key={limit.window}>
                <span className="text-muted-foreground capitalize">
                  {windowName(limit)}
                </span>
                <div className="bg-foreground/10 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${left}%`,
                      backgroundColor: usageColor(left),
                    }}
                  />
                </div>
                <span
                  className="text-right tabular-nums"
                  style={{ color: usageColor(left) }}
                >
                  {left}%
                </span>
                <span
                  className="text-muted-foreground whitespace-nowrap tabular-nums"
                  title={
                    limit.resetsAt === null
                      ? undefined
                      : fullTime(limit.resetsAt * 1000)
                  }
                >
                  {limit.resetsAt === null
                    ? ''
                    : timeLeft(limit.resetsAt * 1000 - props.now)}
                </span>
              </Fragment>
            )
          })}
        </div>
      )}
      {usage !== undefined && usage.error !== null && (
        <p className="text-destructive text-xs">
          Couldn&apos;t refresh: {usage.error}
        </p>
      )}
      {usage !== undefined && usage.error === null && limits.length === 0 && (
        <p className="text-muted-foreground/70 text-xs">
          No limits reported for this account
        </p>
      )}
    </li>
  )
}

const providerColors: Record<Account['provider'], string> = {
  claude: '#d97757',
  codex: '#6e5ae6',
}

function accountLabel(account: Account) {
  if (account.displayName !== null) {
    return account.displayName
  }
  if (account.email === null) {
    throw new Error(`${account.name} has no email`)
  }
  if (
    account.organization !== null &&
    account.organization !== `${account.email}'s Organization`
  ) {
    return account.organization
  }
  return account.email.split('@')[0]
}

function planName(provider: Account['provider'], plan: string) {
  return plan
    .split(/[\s_]+/)
    .filter((word) => word.toLowerCase() !== provider)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function usageColor(left: number) {
  return `hsl(${(left / 100) * 130} 40% 48%)`
}

function accountsOf(machine: Machine, accounts: Account[]) {
  return accounts.map((account) => ({ machine, account }))
}
