import type { Config, Platform, TerminalConfig } from '@server/protocol'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { updateConfig } from '@/store'
import { builtinFonts, platforms } from '@/terminal/config'
import { NumberInput, Row, Section, TextInput } from './controls'
import { BehaviorSection, IdentitySection, MacKeysSection } from './sections'
import { ShellInput } from './shell-input'

export function TerminalPage(props: {
  config: Config
  platform: Platform
  defaultShell: string
}) {
  const terminal = props.config.terminal
  const [customFont, setCustomFont] = useState(
    !builtinFonts.some((font) => font.family === terminal.font.family)
  )
  const [platform, setPlatform] = useState(props.platform)

  function commit(next: TerminalConfig) {
    updateConfig({ ...props.config, terminal: next })
  }

  function update<
    Key extends Exclude<keyof TerminalConfig, 'scrollback' | 'boldIsBright'>,
  >(key: Key, value: Partial<TerminalConfig[Key]>) {
    commit({ ...terminal, [key]: { ...terminal[key], ...value } })
  }

  return (
    <>
      <Section title="Shell" note="Applies to new terminals">
        <Row label="Platform">
          <Select
            value={platform}
            onValueChange={(value: Platform) => setPlatform(value)}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platforms.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                  {item.value === props.platform && (
                    <span className="text-muted-foreground">(this device)</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Command">
          <ShellInput
            key={`${platform}-command`}
            platform={platform}
            device={props.platform}
            value={terminal.shell[platform]}
            onCommit={(command) =>
              commit({
                ...terminal,
                shell: { ...terminal.shell, [platform]: command },
              })
            }
          />
        </Row>
      </Section>
      <Section title="Font">
        <Row label="Family">
          <Select
            value={customFont ? 'custom' : terminal.font.family}
            onValueChange={(family) => {
              setCustomFont(family === 'custom')
              if (family !== 'custom') update('font', { family })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {builtinFonts.map((font) => (
                <SelectItem key={font.family} value={font.family}>
                  {font.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        {customFont && (
          <Row label="Custom family">
            <TextInput
              placeholder="Installed font name"
              value={terminal.font.family}
              onCommit={(family) => update('font', { family })}
            />
          </Row>
        )}
        <Row label="Size">
          <NumberInput
            value={terminal.font.size}
            step={0.5}
            onCommit={(size) => update('font', { size })}
          />
        </Row>
        <Row label="Line height">
          <NumberInput
            value={terminal.font.lineHeight}
            step={0.05}
            onCommit={(lineHeight) => update('font', { lineHeight })}
          />
        </Row>
        <Row label="Ligatures">
          <Switch
            checked={terminal.font.ligatures}
            onCheckedChange={(ligatures) => update('font', { ligatures })}
          />
        </Row>
        <Row label="Bold text in bright colors">
          <Switch
            checked={terminal.boldIsBright}
            onCheckedChange={(boldIsBright) =>
              commit({ ...terminal, boldIsBright })
            }
          />
        </Row>
      </Section>
      <Section title="Cursor">
        <Row label="Style">
          <Select
            value={terminal.cursor.style}
            onValueChange={(style: TerminalConfig['cursor']['style']) =>
              update('cursor', { style })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="block">Block</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="underline">Underline</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Blink">
          <Switch
            checked={terminal.cursor.blink}
            onCheckedChange={(blink) => update('cursor', { blink })}
          />
        </Row>
      </Section>
      <BehaviorSection
        behavior={terminal.behavior}
        platform={props.platform}
        shellCommand={terminal.shell[props.platform]}
        defaultShell={props.defaultShell}
        onChange={(value) => update('behavior', value)}
      />
      <MacKeysSection
        behavior={terminal.behavior}
        onChange={(value) => update('behavior', value)}
      />
      <IdentitySection
        behavior={terminal.behavior}
        onChange={(value) => update('behavior', value)}
      />
      <Section title="Layout">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <Row key={side} label={`Padding ${side}`}>
            <NumberInput
              value={terminal.padding[side]}
              onCommit={(value) => update('padding', { [side]: value })}
            />
          </Row>
        ))}
        <Row label="Scrollback lines">
          <NumberInput
            value={terminal.scrollback}
            step={1000}
            onCommit={(scrollback) => commit({ ...terminal, scrollback })}
          />
        </Row>
      </Section>
    </>
  )
}
