import type { Config } from '@offsite/core/config'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Row, Section } from './controls'

const presets = [10, 15, 30, 45, 60, 120, 180, 300, 600, 900, 1800, 3600]

export function AgentsSection(props: { machine: string; config: Config }) {
  const config = props.config

  function save(patch: Partial<Config>) {
    void updateConfig(props.machine, { ...config, ...patch })
  }

  return (
    <Section title="Agents">
      <Row label="Send while working">
        <Select
          value={config.delivery}
          onValueChange={(delivery) => {
            if (delivery !== 'queue' && delivery !== 'steer') {
              throw new Error(`Unknown delivery ${delivery}`)
            }
            void updateConfig(props.machine, { ...config, delivery })
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="queue">Queue messages</SelectItem>
            <SelectItem value="steer">Steer the agent</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Auto-skip questions">
        <Timeout
          value={config.autoSkipQuestionTimeout}
          onChange={(autoSkipQuestionTimeout) =>
            save({ autoSkipQuestionTimeout })
          }
        />
      </Row>
      <Row label="Auto-resolve permissions">
        <div className="flex items-center gap-2">
          {config.autoPermissionTimeout !== null && (
            <Select
              value={config.autoPermissionMode}
              onValueChange={(autoPermissionMode) => {
                if (
                  autoPermissionMode !== 'allow' &&
                  autoPermissionMode !== 'deny'
                ) {
                  throw new Error(`Unknown decision ${autoPermissionMode}`)
                }
                save({ autoPermissionMode })
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Timeout
            value={config.autoPermissionTimeout}
            onChange={(autoPermissionTimeout) =>
              save({ autoPermissionTimeout })
            }
          />
        </div>
      </Row>
    </Section>
  )
}

function Timeout(props: {
  value: number | null
  onChange: (value: number | null) => void
}) {
  const options =
    props.value === null || presets.includes(props.value)
      ? presets
      : [...presets, props.value].sort((first, second) => first - second)

  return (
    <Select
      value={props.value === null ? 'off' : String(props.value)}
      onValueChange={(value) =>
        props.onChange(value === 'off' ? null : Number(value))
      }
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="off">Off</SelectItem>
        {options.map((seconds) => (
          <SelectItem key={seconds} value={String(seconds)}>
            {seconds === 3600
              ? 'After 1 hour'
              : seconds === 60
                ? 'After 1 minute'
                : seconds % 60 === 0
                  ? `After ${seconds / 60} minutes`
                  : `After ${seconds} seconds`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
