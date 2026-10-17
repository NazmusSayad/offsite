import type { Account, Config, Model } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { ProviderIcon } from '@/components/icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { providerNames } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

export function GitSection(props: {
  machine: string
  config: Config
  claudeAccounts: Account[]
  codexAccounts: Account[]
  openCode: { available: boolean }
}) {
  const settings = props.config.commitMessage
  const [models, setModels] = useState<Model[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings.provider === null) {return}
    let current = true
    setModels(null)
    setError(null)
    call(props.machine, 'capabilities', {
      provider: settings.provider,
      accountId: settings.accountId,
      projectId: null,
    }).then(
      (capabilities) => {
        if (current) {setModels(capabilities.models)}
      },
      (caught: unknown) => {
        if (current) {setError(errorMessage(caught))}
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, settings.provider, settings.accountId])

  function save(commitMessage: Config['commitMessage']) {
    void updateConfig(props.machine, { ...props.config, commitMessage })
  }

  function choose(value: string) {
    if (value === 'off') {
      save({ provider: null, accountId: null, model: null })
      return
    }
    if (value === 'opencode') {
      save({ provider: 'opencode', accountId: null, model: null })
      return
    }
    const account = [...props.claudeAccounts, ...props.codexAccounts].find(
      (item) => item.id === value
    )
    if (account === undefined) {throw new Error('That account was removed')}
    save({ provider: account.provider, accountId: account.id, model: null })
  }

  return (
    <Section title="Commit messages">
      <Row label="Account">
        <Select
          value={
            settings.provider === null
              ? 'off'
              : settings.provider === 'opencode'
                ? 'opencode'
                : (settings.accountId ?? 'off')
          }
          onValueChange={choose}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            {[...props.claudeAccounts, ...props.codexAccounts].map(
              (account) => (
                <SelectItem
                  key={account.id}
                  value={account.id}
                  disabled={!account.valid}
                >
                  <ProviderIcon
                    provider={account.provider}
                    className="size-4"
                  />
                  {`${providerNames[account.provider]} · ${account.name}`}
                </SelectItem>
              )
            )}
            {props.openCode.available && (
              <SelectItem value="opencode">
                <ProviderIcon provider="opencode" className="size-4" />
                {providerNames.opencode}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </Row>
      {settings.provider !== null && (
        <Row label="Model">
          <Select
            value={settings.model ?? undefined}
            disabled={models === null}
            onValueChange={(model) => save({ ...settings, model })}
          >
            <SelectTrigger className="w-56">
              <SelectValue
                placeholder={
                  error !== null
                    ? 'Unavailable'
                    : models === null
                      ? 'Loading…'
                      : 'Choose a model'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(models ?? [])
                .filter(
                  (model) => !model.hidden || model.value === settings.model
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
    </Section>
  )
}
