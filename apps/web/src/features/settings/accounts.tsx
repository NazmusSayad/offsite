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
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { update } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { AccountPage, NewAccountPage } from './account-page'
import { Row, Section, TextInput } from './controls'

export function ProviderPage(props: {
  machine: string
  config: Config
  provider: Provider
  accounts: Account[]
  selected: string | null
}) {
  const config = props.config
  const enabled = config.enabledProviders[props.provider]
  const accounts = props.accounts.filter(
    (account) => account.provider === props.provider
  )
  const account = accounts.find((item) => item.valid)

  if (props.selected === 'new') {
    if (props.provider === 'opencode')
      throw new Error('OpenCode accounts cannot be added')
    return <NewAccountPage machine={props.machine} provider={props.provider} />
  }
  if (props.selected !== null) {
    const selected = accounts.find((item) => item.id === props.selected)
    if (selected === undefined)
      return (
        <p className="text-muted-foreground text-sm">
          This account no longer exists.
        </p>
      )
    return (
      <AccountPage
        machine={props.machine}
        settings={config.models[props.provider]}
        account={selected}
      />
    )
  }

  return (
    <>
      {props.provider === 'claude' && (
        <div className="divide-y overflow-hidden rounded-xl border">
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
        </div>
      )}
      {props.provider === 'opencode' && (
        <p className="text-muted-foreground px-1 text-xs">
          Sign in with <code className="font-mono">opencode auth login</code>
        </p>
      )}
      <div
        className={cn('space-y-5 transition-opacity', !enabled && 'opacity-50')}
      >
        {props.provider !== 'opencode' && (
          <Section title="Accounts">
            <ProviderAccounts machine={props.machine} accounts={accounts} />
          </Section>
        )}
        {enabled && account !== undefined && (
          <ProviderModels
            machine={props.machine}
            config={config}
            provider={props.provider}
            accountId={account.id}
          />
        )}
      </div>
    </>
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
    <Section title="Models">
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
    </Section>
  )
}

function ProviderAccounts(props: { machine: string; accounts: Account[] }) {
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
            onClick={() => update({ settingsAccount: account.id })}
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
        onClick={() => update({ settingsAccount: 'new' })}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        Add account
      </button>
      {error !== null && (
        <p className="text-destructive px-4 py-3 text-xs">{error}</p>
      )}
    </>
  )
}
