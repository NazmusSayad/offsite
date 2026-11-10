import type { Account } from '@offsite/core/providers'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { hasUsage, usageKey } from '@/lib/usage'
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
