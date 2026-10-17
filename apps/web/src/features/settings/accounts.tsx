import {
  Add01Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account, Config, Provider } from '@offsite/core/protocol'
import { type ReactNode, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { providerNames } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import { Row, TextInput } from './controls'

export function AccountsPage(props: {
  machine: string
  config: Config
  accounts: Account[]
}) {
  const config = props.config

  function setEnabled(provider: Provider, enabled: boolean) {
    void updateConfig(props.machine, {
      ...config,
      enabledProviders: { ...config.enabledProviders, [provider]: enabled },
    })
  }

  return (
    <>
      <ProviderSection
        provider="claude"
        enabled={config.enabledProviders.claude}
        onEnabledChange={(enabled) => setEnabled('claude', enabled)}
      >
        <Row label="Base directory">
          <TextInput
            key={config.claudeBaseDir}
            className="w-72 font-mono"
            value={config.claudeBaseDir}
            valid={(text) => text.trim() !== ''}
            onCommit={(claudeBaseDir) =>
              updateConfig(props.machine, { ...config, claudeBaseDir })
            }
          />
        </Row>
        <ProviderAccounts
          machine={props.machine}
          provider="claude"
          accounts={props.accounts.filter(
            (account) => account.provider === 'claude'
          )}
        />
      </ProviderSection>
      <ProviderSection
        provider="codex"
        enabled={config.enabledProviders.codex}
        onEnabledChange={(enabled) => setEnabled('codex', enabled)}
      >
        <ProviderAccounts
          machine={props.machine}
          provider="codex"
          accounts={props.accounts.filter(
            (account) => account.provider === 'codex'
          )}
        />
      </ProviderSection>
      <ProviderSection
        provider="opencode"
        enabled={config.enabledProviders.opencode}
        onEnabledChange={(enabled) => setEnabled('opencode', enabled)}
      >
        <p className="text-muted-foreground px-4 py-3 text-xs">
          Sign in with <code className="font-mono">opencode auth login</code>
        </p>
      </ProviderSection>
    </>
  )
}

function ProviderSection(props: {
  provider: Provider
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-2.5 px-1 text-sm font-semibold">
        <span className="flex size-4 items-center justify-center">
          <ProviderIcon
            provider={props.provider}
            className={cn(
              props.provider === 'claude' && 'size-4',
              props.provider === 'codex' && 'size-[19px] shrink-0',
              props.provider === 'opencode' && 'h-3.5'
            )}
          />
        </span>
        {providerNames[props.provider]}
        <Switch
          className="ml-auto"
          checked={props.enabled}
          onCheckedChange={props.onEnabledChange}
          aria-label={`Enable ${providerNames[props.provider]}`}
        />
      </h2>
      <div
        className={cn(
          'divide-y overflow-hidden rounded-xl border transition-opacity',
          !props.enabled && 'opacity-50'
        )}
      >
        {props.children}
      </div>
    </section>
  )
}

function ProviderAccounts(props: {
  machine: string
  provider: 'claude' | 'codex'
  accounts: Account[]
}) {
  const [form, setForm] = useState<{
    id: string | null
    name: string
    configDir: string
    enabled: boolean
  } | null>(null)
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

  const formElement = form !== null && (
    <form
      className="flex items-center gap-2 px-4 py-3"
      onSubmit={async (event) => {
        event.preventDefault()
        const saved = await run(() =>
          form.id === null
            ? call(props.machine, 'accounts.add', {
                provider: props.provider,
                name: form.name,
                configDir: form.configDir,
              })
            : call(props.machine, 'accounts.update', {
                id: form.id,
                name: form.name,
                configDir: form.configDir,
                enabled: form.enabled,
              })
        )
        if (saved) setForm(null)
      }}
    >
      <Input
        className="w-40"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
        placeholder="Name"
      />
      <Input
        className="min-w-0 flex-1 font-mono"
        value={form.configDir}
        onChange={(event) =>
          setForm({ ...form, configDir: event.target.value })
        }
        placeholder={
          props.provider === 'claude' ? '~/.claude-work' : '~/.codex-work'
        }
      />
      <Button type="button" variant="ghost" onClick={() => setForm(null)}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={
          busy || form.name.trim() === '' || form.configDir.trim() === ''
        }
      >
        {form.id === null ? 'Add' : 'Save'}
      </Button>
    </form>
  )

  return (
    <>
      {props.accounts.map((account) =>
        form?.id === account.id ? (
          <div key={account.id}>{formElement}</div>
        ) : (
          <div key={account.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                !account.enabled && 'bg-muted-foreground/40',
                account.enabled && account.error !== null && 'bg-destructive',
                account.enabled &&
                  account.error === null &&
                  !account.linked &&
                  'bg-warning',
                account.enabled &&
                  account.error === null &&
                  account.linked &&
                  'bg-success'
              )}
            />
            <div
              className={cn('min-w-0 flex-1', !account.enabled && 'opacity-50')}
            >
              <div className="text-sm font-medium">{account.name}</div>
              <div
                className={cn(
                  'truncate text-xs',
                  account.error !== null && 'text-destructive',
                  account.error === null && !account.linked && 'text-warning',
                  account.error === null &&
                    account.linked &&
                    'text-muted-foreground'
                )}
              >
                {account.error ??
                  (account.linked
                    ? [account.email, account.plan, account.configDir]
                        .filter((part) => part !== null)
                        .join(' · ')
                    : 'Not linked to shared threads · hidden in the composer')}
              </div>
            </div>
            <Switch
              size="sm"
              checked={account.enabled}
              disabled={busy}
              onCheckedChange={(enabled) =>
                void run(() =>
                  call(props.machine, 'accounts.update', {
                    id: account.id,
                    name: account.name,
                    configDir: account.configDir,
                    enabled,
                  })
                )
              }
              aria-label={`Enable ${account.name}`}
            />
            <Button
              size="icon-sm"
              variant="ghost-muted"
              title="Edit account"
              onClick={() =>
                setForm({
                  id: account.id,
                  name: account.name,
                  configDir: account.configDir,
                  enabled: account.enabled,
                })
              }
            >
              <HugeiconsIcon icon={PencilEdit02Icon} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost-muted"
              title="Remove account"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  call(props.machine, 'accounts.remove', { id: account.id })
                )
              }
            >
              <HugeiconsIcon icon={Delete02Icon} />
            </Button>
          </div>
        )
      )}
      {form?.id === null ? (
        formElement
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors"
          onClick={() =>
            setForm({ id: null, name: '', configDir: '', enabled: true })
          }
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add account
        </button>
      )}
      {error !== null && (
        <p className="text-destructive px-4 py-3 text-xs">{error}</p>
      )}
    </>
  )
}
