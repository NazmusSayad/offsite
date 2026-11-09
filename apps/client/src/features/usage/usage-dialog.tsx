import type { Account } from '@offsite/core/providers'
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type Machine, showUsage, useStore } from '@/lib/store'
import { hasUsage, usageKey } from '@/lib/usage'
import { AccountUsage } from './account-usage'

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
    { machine: string; account: Account; machines: Machine[]; names: string[] }
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
        names: [entry.account.name],
      })
    } else {
      group.machines.push(entry.machine)
      group.names.push(entry.account.name)
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
          names={entry[1].names}
          now={now}
          refreshable
          className="px-5 py-4"
        />
      ))}
    </ul>
  )
}

function accountsOf(machine: Machine, accounts: Account[]) {
  return accounts.map((account) => ({ machine, account }))
}
