import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account } from '@server/protocol'
import { useState } from 'react'
import { resetLabel, windowName } from '@/accounts/limits'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { call } from '@/connection'
import { cn, errorMessage } from '@/lib/utils'
import { updateConfig, useStore } from '@/store'
import { Row, Section, TextInput } from './controls'

export function AccountsPage() {
  const accounts = useStore((state) => state.accounts)
  const config = useStore((state) => state.config)
  const [linking, setLinking] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<null>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="Claude"
        note="Threads are read from this directory. Every account links to it."
      >
        <Row label="Base directory">
          <TextInput
            key={config.claudeBaseDir}
            className="w-72 font-mono"
            value={config.claudeBaseDir}
            valid={(text) => text.trim() !== ''}
            onCommit={(claudeBaseDir) =>
              updateConfig({ ...config, claudeBaseDir })
            }
          />
        </Row>
      </Section>
      {accounts.length > 0 && (
        <Section
          title="Claude accounts"
          note="Every account shares the same sessions. Pick one per message from the composer."
        >
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <TextInput
                  key={account.name}
                  className="w-40"
                  value={account.name}
                  valid={(text) => text.trim() !== ''}
                  onCommit={(name) =>
                    void run(() =>
                      call('accounts.update', {
                        id: account.id,
                        name,
                        configDir: account.configDir,
                      })
                    )
                  }
                />
                <TextInput
                  key={account.configDir}
                  className="min-w-0 flex-1 font-mono"
                  value={account.configDir}
                  valid={(text) => text.trim() !== ''}
                  onCommit={(dir) =>
                    void run(() =>
                      call('accounts.update', {
                        id: account.id,
                        name: account.name,
                        configDir: dir,
                      })
                    )
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Remove account"
                  disabled={busy}
                  onClick={() =>
                    void run(() => call('accounts.remove', { id: account.id }))
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
              <div
                className={cn(
                  'truncate text-xs',
                  account.error === null
                    ? 'text-muted-foreground'
                    : 'text-destructive'
                )}
              >
                {account.error ??
                  [account.email, account.plan]
                    .filter((part) => part !== null)
                    .join(' · ')}
              </div>
              {!account.linked && (
                <div className="flex items-center gap-2">
                  <p className="text-warning min-w-0 flex-1 text-xs">
                    Not linked to the base directory. Its threads are not shared
                    with the other accounts.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setLinking(account)}
                  >
                    Link
                  </Button>
                </div>
              )}
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
        </Section>
      )}
      <Section title="Add an account">
        <form
          className="flex flex-col gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => call('accounts.add', { name, configDir })).then(
              (added) => {
                if (!added) return
                setName('')
                setConfigDir('')
              }
            )
          }}
        >
          <p className="text-muted-foreground text-xs">
            Each account is a Claude config directory. To sign in to a new one,
            run{' '}
            <code className="font-mono">
              CLAUDE_CONFIG_DIR=~/.claude-work claude
            </code>{' '}
            in a terminal and log in.
          </p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name, e.g. Work"
          />
          <Input
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder="Config directory, e.g. ~/.claude-work"
          />
          {error !== null && (
            <p className="text-destructive text-xs">{error}</p>
          )}
          <Button
            type="submit"
            className="self-end"
            disabled={busy || name.trim() === '' || configDir.trim() === ''}
          >
            Add account
          </Button>
        </form>
      </Section>
      <AlertDialog
        open={linking !== null}
        onOpenChange={(open) => {
          if (!open) setLinking(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link {linking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every thread in{' '}
              <code className="font-mono">{linking?.configDir}/projects</code>{' '}
              and replaces it with a link to{' '}
              <code className="font-mono">{config.claudeBaseDir}/projects</code>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (linking === null) return
                void run(() => call('accounts.link', { id: linking.id }))
              }}
            >
              Delete threads and link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
