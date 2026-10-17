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
  accounts: Account[]
}) {
  const settings = props.config.commitMessage
  const [models, setModels] = useState<Model[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings.accountId === null) return
    let current = true
    setModels(null)
    setError(null)
    call(props.machine, 'capabilities', {
      accountId: settings.accountId,
      projectId: null,
    }).then(
      (capabilities) => {
        if (current) setModels(capabilities.models)
      },
      (caught: unknown) => {
        if (current) setError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, settings.accountId])

  function save(commitMessage: Config['commitMessage']) {
    void updateConfig(props.machine, { ...props.config, commitMessage })
  }

  return (
    <Section title="Commit messages">
      <Row label="Account">
        <Select
          value={settings.accountId ?? 'off'}
          onValueChange={(value) =>
            save({ accountId: value === 'off' ? null : value, model: null })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            {props.accounts.map((account) => (
              <SelectItem
                key={account.id}
                value={account.id}
                disabled={!account.valid}
              >
                <ProviderIcon provider={account.provider} className="size-4" />
                {account.provider === 'opencode'
                  ? providerNames.opencode
                  : `${providerNames[account.provider]} · ${account.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {settings.accountId !== null && (
        <Row label="Model">
          <Select
            value={settings.model ?? undefined}
            disabled={models === null}
            onValueChange={(model) =>
              save({ accountId: settings.accountId, model })
            }
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
