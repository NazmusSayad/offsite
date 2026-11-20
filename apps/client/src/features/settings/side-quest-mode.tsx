import { CODEX_MODES, type Config } from '@offsite/core/config'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fixedModes } from '@/features/composer/more-menu'
import { Row, Section } from './controls'

export function SideQuestModeSection(props: {
  machine: string
  config: Config
}) {
  function choose(value: string) {
    const mode = CODEX_MODES.find((item) => item === value)
    if (mode === undefined) {
      throw new Error(`Codex has no ${value} mode`)
    }
    void updateConfig(props.machine, {
      ...props.config,
      codex: { ...props.config.codex, sideQuestMode: mode },
    })
  }

  return (
    <Section title="Side quests">
      <Row label="Permission mode">
        <Select value={props.config.codex.sideQuestMode} onValueChange={choose}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fixedModes.codex.map((mode) => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </Section>
  )
}
