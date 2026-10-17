import type { Config } from '@offsite/core/protocol'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Row, Section } from './controls'

const presets = [1, 2, 3, 5, 10, 15, 30, 60]

export function AgentsSection(props: { machine: string; config: Config }) {
  const config = props.config
  const autoResolve = config.autoResolve

  function save(patch: Partial<Config['autoResolve']>) {
    void updateConfig(props.machine, {
      ...config,
      autoResolve: { ...autoResolve, ...patch },
    })
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
      <Row label="Auto-submit questions">
        <Timeout
          value={autoResolve.questions}
          onChange={(questions) => save({ questions })}
        />
      </Row>
      <Row label="Auto-resolve permissions">
        <div className="flex items-center gap-2">
          {autoResolve.permissions !== null && (
            <Select
              value={autoResolve.permissionDecision}
              onValueChange={(permissionDecision) => {
                if (
                  permissionDecision !== 'allow' &&
                  permissionDecision !== 'deny'
                ) {
                  throw new Error(`Unknown decision ${permissionDecision}`)
                }
                save({ permissionDecision })
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
            value={autoResolve.permissions}
            onChange={(permissions) => save({ permissions })}
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
        {options.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            {minutes === 60
              ? 'After 1 hour'
              : `After ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
