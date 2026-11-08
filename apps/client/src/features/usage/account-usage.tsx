import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account } from '@offsite/core/providers'
import { type CSSProperties, Fragment, useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { MachineLogo } from '@/constants/machine-icons'
import { windowName } from '@/features/composer/limits'
import { fullTime, timeAgo, timeLeft } from '@/lib/format'
import type { Machine } from '@/lib/store'
import { loadUsage, useUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'

export function AccountUsage(props: {
  machine: string
  account: Account
  machines: Machine[]
  names: string[]
  now: number
  className: string
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
    <li className={cn('flex flex-col gap-3', props.className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <ProviderIcon
            provider={account.provider}
            className="size-3.5 shrink-0"
          />
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn('truncate font-medium', loading && 'text-shimmer')}
              style={
                loading
                  ? ({
                      '--shimmer-color': providerColors[account.provider],
                    } as CSSProperties)
                  : { color: providerColors[account.provider] }
              }
            >
              {new Set(props.names).size === 1
                ? account.name
                : accountLabel(account)}
            </span>
            {account.plan !== null && (
              <span
                className={cn(
                  'shrink-0',
                  loading ? 'text-shimmer' : 'text-muted-foreground'
                )}
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
            className={cn('size-3', refreshing && 'animate-spin')}
          />
        </Button>
      </div>
      {usage === undefined && (
        <div className="grid grid-cols-[minmax(2.5rem,max-content)_minmax(0,1fr)_2.25rem_3.25rem] items-center gap-x-3 gap-y-2 text-xs">
          {Array.from({ length: 2 }, (_, index) => (
            <Fragment key={index}>
              <span className="bg-foreground/10 my-0.5 h-3 w-12 animate-pulse rounded" />
              <span className="bg-foreground/10 h-1.5 animate-pulse rounded-full" />
              <span className="bg-foreground/10 ml-auto h-3 w-7 animate-pulse rounded" />
              <span className="bg-foreground/10 h-3 w-10 animate-pulse rounded" />
            </Fragment>
          ))}
        </div>
      )}
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

export function usageColor(left: number) {
  return `hsl(${(left / 100) * 130} 40% 48%)`
}
