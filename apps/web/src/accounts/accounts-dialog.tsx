import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account } from '@server/protocol'
import { useState } from 'react'
import { resetLabel, windowName } from '@/accounts/limits'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { call } from '@/connection'
import { cn, errorMessage } from '@/lib/utils'
import { setAccounts, showAccounts, useStore } from '@/store'

export function AccountsDialog() {
  const open = useStore((state) => state.accountsOpen)
  const accounts = useStore((state) => state.accounts)
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<Account[]>) {
    setBusy(true)
    setError(null)
    try {
      setAccounts(await action())
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={showAccounts}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Claude accounts</DialogTitle>
          <DialogDescription>
            Every account shares the same sessions. Pick one per message from
            the composer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-secondary dark:bg-input/20 flex flex-col gap-2 rounded-lg p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{account.name}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {account.error ??
                      ([account.email, account.plan]
                        .filter((part) => part !== null)
                        .join(' · ') ||
                        'Token account · checked on first message')}
                  </div>
                </div>
                {account.id !== 'default' && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Remove account"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        call('accounts.remove', { id: account.id })
                      )
                    }
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                )}
              </div>
              {account.limits.map((limit) => (
                <div key={limit.window} className="flex flex-col gap-1">
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>
                      {windowName(limit)}
                      {limit.utilization !== null &&
                        ` · ${Math.round(limit.utilization * 100)}% used`}
                      {limit.rejected && ' · limit reached'}
                    </span>
                    <span>{resetLabel(limit)}</span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'bg-primary h-full',
                        (limit.rejected || (limit.utilization ?? 0) > 0.8) &&
                          'bg-destructive'
                      )}
                      style={{
                        width: `${limit.rejected ? 100 : Math.round((limit.utilization ?? 0) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {account.limits.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  Usage shows up after the first message on this account.
                </div>
              )}
            </div>
          ))}
        </div>
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => call('accounts.add', { name, token })).then(
              (added) => {
                if (!added) return
                setName('')
                setToken('')
              }
            )
          }}
        >
          <div className="font-medium">Add an account</div>
          <p className="text-muted-foreground text-xs">
            In a terminal, run{' '}
            <code className="font-mono">claude setup-token</code>, sign in with
            the other Claude account, then paste the token it prints.
          </p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name, e.g. Work"
          />
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="sk-ant-oat01-…"
            type="password"
          />
          {error !== null && (
            <p className="text-destructive text-xs">{error}</p>
          )}
          <Button
            type="submit"
            disabled={busy || name.trim() === '' || token.trim() === ''}
          >
            Add account
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
