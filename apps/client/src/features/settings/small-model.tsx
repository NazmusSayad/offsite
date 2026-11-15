import { type Config, DEFAULT_SMALL_MODELS } from '@offsite/core/config'
import type { Model, Provider } from '@offsite/core/providers'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Row, Section } from './controls'

const DEFAULT = 'offsite:default'

export function SmallModelSection(props: {
  machine: string
  config: Config
  provider: Provider
  models: Model[]
}) {
  const settings = props.config[props.provider]
  const fallback =
    props.provider === 'opencode' ? null : DEFAULT_SMALL_MODELS[props.provider]

  function choose(value: string) {
    void updateConfig(props.machine, {
      ...props.config,
      [props.provider]: {
        ...settings,
        smallModel: value === DEFAULT ? null : value,
      },
    })
  }

  return (
    <Section
      title="Small model"
      note="Titles, notifications, branch names, commits and pull requests, on the thread's account"
    >
      <Row label="Model">
        <Select value={settings.smallModel ?? DEFAULT} onValueChange={choose}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>
              {fallback === null
                ? 'Thread’s model'
                : `Default · ${props.models.find((model) => model.value === fallback)?.name ?? fallback}`}
            </SelectItem>
            {props.provider !== 'opencode' &&
              props.models.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.name}
                </SelectItem>
              ))}
            {props.provider === 'opencode' &&
              [...new Set(props.models.map((model) => model.description))].map(
                (provider) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>{provider}</SelectLabel>
                    {props.models
                      .filter((model) => model.description === provider)
                      .map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                )
              )}
          </SelectContent>
        </Select>
      </Row>
    </Section>
  )
}
