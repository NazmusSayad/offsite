import {
  Add01Icon,
  Delete02Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  Account,
  Capabilities,
  Config,
  ModelSetting,
  Provider,
} from '@offsite/core/protocol'
import { type ReactNode, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { providerNames } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import { AccountDialog } from './account-dialog'
import { Row, TextInput } from './controls'

export function AccountsPage(props: {
  machine: string
  config: Config
  accounts: Account[]
}) {
  const config = props.config

  return (
    <>
      <ProviderSection
        machine={props.machine}
        config={config}
        provider="claude"
        accounts={props.accounts}
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
          settings={config.models.claude}
          accounts={props.accounts.filter(
            (account) => account.provider === 'claude'
          )}
        />
      </ProviderSection>
      <ProviderSection
        machine={props.machine}
        config={config}
        provider="codex"
        accounts={props.accounts}
      >
        <ProviderAccounts
          machine={props.machine}
          provider="codex"
          settings={config.models.codex}
          accounts={props.accounts.filter(
            (account) => account.provider === 'codex'
          )}
        />
      </ProviderSection>
      <ProviderSection
        machine={props.machine}
        config={config}
        provider="opencode"
        accounts={props.accounts}
      >
        <p className="text-muted-foreground px-4 py-3 text-xs">
          Sign in with <code className="font-mono">opencode auth login</code>
        </p>
      </ProviderSection>
    </>
  )
}

function ProviderSection(props: {
  machine: string
  config: Config
  provider: Provider
  accounts: Account[]
  children: ReactNode
}) {
  const enabled = props.config.enabledProviders[props.provider]
  const account = props.accounts.find(
    (item) => item.provider === props.provider && item.valid
  )

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
          checked={enabled}
          onCheckedChange={(checked) =>
            void updateConfig(props.machine, {
              ...props.config,
              enabledProviders: {
                ...props.config.enabledProviders,
                [props.provider]: checked,
              },
            })
          }
          aria-label={`Enable ${providerNames[props.provider]}`}
        />
      </h2>
      <div
        className={cn('space-y-3 transition-opacity', !enabled && 'opacity-50')}
      >
        <div className="divide-y overflow-hidden rounded-xl border">
          {props.children}
        </div>
        {enabled && account !== undefined && (
          <ProviderModels
            machine={props.machine}
            config={props.config}
            provider={props.provider}
            accountId={account.id}
          />
        )}
      </div>
    </section>
  )
}

function ProviderModels(props: {
  machine: string
  config: Config
  provider: Provider
  accountId: string
}) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [error, setError] = useState<string | null>(null)
  const settings = props.config.models[props.provider]
  const models = capabilities === null ? null : capabilities.models
  const defaultModel =
    props.config.defaultModels[props.provider] ??
    (capabilities === null ? null : capabilities.providerDefaultModel)

  useEffect(() => {
    let current = true
    setCapabilities(null)
    setError(null)
    call(props.machine, 'capabilities', {
      accountId: props.accountId,
      projectId: null,
    }).then(
      (result) => {
        if (current) setCapabilities(result)
      },
      (caught: unknown) => {
        if (current) setError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, props.accountId])

  function save(value: string, setting: ModelSetting) {
    void updateConfig(props.machine, {
      ...props.config,
      models: {
        ...props.config.models,
        [props.provider]: { ...settings, [value]: setting },
      },
    })
  }

  return (
    <div className="divide-y overflow-hidden rounded-xl border">
      {models !== null && (
        <Row label="Default model">
          <Select
            value={defaultModel ?? undefined}
            onValueChange={(value) =>
              void updateConfig(props.machine, {
                ...props.config,
                defaultModels: {
                  ...props.config.defaultModels,
                  [props.provider]: value,
                },
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {models
                .filter(
                  (model) =>
                    !(settings[model.value]?.hidden ?? model.deprecated) ||
                    model.value === defaultModel
                )
                .map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Row>
      )}
      <div className="text-muted-foreground px-4 py-2 text-xs font-medium">
        Models
      </div>
      {error !== null && (
        <p className="text-destructive px-4 py-3 text-xs">{error}</p>
      )}
      {error === null && models === null && (
        <p className="text-muted-foreground px-4 py-3 text-xs">Loading…</p>
      )}
      {(models ?? []).map((model) => {
        const setting = settings[model.value] ?? {
          hidden: model.deprecated,
          effort: model.effort,
        }
        return (
          <div
            key={model.value}
            className="flex min-h-11 items-center gap-3 px-4 py-1.5"
          >
            <div
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                setting.hidden && 'text-muted-foreground'
              )}
            >
              {model.name}
              {props.provider === 'opencode' && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {model.description}
                </span>
              )}
            </div>
            {model.efforts.length > 0 && (
              <Select
                value={setting.effort ?? undefined}
                onValueChange={(effort) =>
                  save(model.value, { ...setting, effort })
                }
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue placeholder="Effort" />
                </SelectTrigger>
                <SelectContent>
                  {model.efforts.map((effort) => (
                    <SelectItem key={effort} value={effort}>
                      {effort.charAt(0).toUpperCase() + effort.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Switch
              size="sm"
              checked={!setting.hidden}
              onCheckedChange={(shown) =>
                save(model.value, { ...setting, hidden: !shown })
              }
              aria-label={`Show ${model.name}`}
            />
          </div>
        )
      })}
    </div>
  )
}

function ProviderAccounts(props: {
  machine: string
  provider: 'claude' | 'codex'
  settings: Record<string, ModelSetting>
  accounts: Account[]
}) {
  const [editing, setEditing] = useState<{ account: Account | null } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<null>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {props.accounts.map((account) => (
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
                  hiddenModels: account.hiddenModels,
                  defaultModel: account.defaultModel,
                })
              )
            }
            aria-label={`Enable ${account.name}`}
          />
          <Button
            size="icon-sm"
            variant="ghost-muted"
            title="Edit account"
            onClick={() => setEditing({ account })}
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
      ))}
      <button
        type="button"
        className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors"
        onClick={() => setEditing({ account: null })}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        Add account
      </button>
      {error !== null && (
        <p className="text-destructive px-4 py-3 text-xs">{error}</p>
      )}
      {editing !== null && (
        <AccountDialog
          machine={props.machine}
          provider={props.provider}
          settings={props.settings}
          account={editing.account}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
