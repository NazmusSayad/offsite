import type { Config } from '@offsite/core/config'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

const SMALL_MODEL = 'offsite:small-model'

export function FinishedCheckSection(props: {
  machine: string
  config: Config
}) {
  const settings = props.config.finishedCheck
  const [models, setModels] = useState<{ id: string; name: string }[] | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setModels(null)
    setError(null)
    call(props.machine, 'finishedCheck.models', undefined).then(
      (value) => {
        if (mounted) {
          setModels(value)
        }
      },
      (reason: unknown) => {
        if (mounted) {
          setError(errorMessage(reason))
        }
      }
    )
    return () => {
      mounted = false
    }
  }, [props.machine])

  return (
    <Section
      title="Finished check"
      note="Decides whether an agent still waits for its background commands"
    >
      <Row label="OpenRouter decision model">
        {error !== null ? (
          <span className="text-muted-foreground text-xs wrap-anywhere">
            {error}
          </span>
        ) : models === null ? (
          <span className="text-muted-foreground text-xs">Checking…</span>
        ) : (
          <Select
            value={settings.openRouterModel ?? SMALL_MODEL}
            onValueChange={(value) =>
              void updateConfig(props.machine, {
                ...props.config,
                finishedCheck: {
                  ...settings,
                  openRouterModel: value === SMALL_MODEL ? null : value,
                },
              })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SMALL_MODEL}>Small model</SelectItem>
              {settings.openRouterModel !== null &&
                !models.some(
                  (model) => model.id === settings.openRouterModel
                ) && (
                  <SelectItem value={settings.openRouterModel}>
                    {settings.openRouterModel}
                  </SelectItem>
                )}
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Row>
      <Row label="API key variable">
        <TextInput
          key={`${props.machine}-${settings.openRouterKeyEnv}`}
          className="font-mono"
          value={settings.openRouterKeyEnv}
          valid={(name) => name.trim() !== ''}
          onCommit={(name) =>
            updateConfig(props.machine, {
              ...props.config,
              finishedCheck: { ...settings, openRouterKeyEnv: name.trim() },
            })
          }
        />
      </Row>
    </Section>
  )
}
