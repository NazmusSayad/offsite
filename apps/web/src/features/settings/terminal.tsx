import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Config, Platform, TerminalConfig } from '@offsite/core/protocol'
import { shellIntegrationIssue } from '@offsite/core/shell-check'
import { useState } from 'react'
import { updateConfig } from '@/api/machine-config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { builtinFonts, platforms } from '@/features/terminal/config'
import type { Prefs, TerminalPrefs } from '@/lib/prefs'
import { updatePrefs } from '@/lib/store'
import { NumberInput, Row, Section, TextInput } from './controls'
import { BehaviorSection, IdentityRow, MacKeysSection } from './sections'
import { ShellInput } from './shell-input'

export function TerminalLookPage(props: { prefs: Prefs }) {
  const terminal = props.prefs.terminal
  const [customFont, setCustomFont] = useState(
    !builtinFonts.some((font) => font.family === terminal.font.family)
  )

  function commit(next: TerminalPrefs) {
    updatePrefs({ ...props.prefs, terminal: next })
  }

  function update<
    Key extends Exclude<keyof TerminalPrefs, 'scrollback' | 'boldIsBright'>,
  >(key: Key, value: Partial<TerminalPrefs[Key]>) {
    commit({ ...terminal, [key]: { ...terminal[key], ...value } })
  }

  return (
    <>
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
            onValueChange={(style: TerminalPrefs['cursor']['style']) =>
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
        onChange={(value) => update('behavior', value)}
      />
      <MacKeysSection
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

export function TerminalMachinePage(props: {
  machine: string
  config: Config
  platform: Platform
  defaultShell: string
}) {
  const terminal = props.config.terminal
  const [platform, setPlatform] = useState(props.platform)
  const shellIssue = shellIntegrationIssue(
    terminal.shell[props.platform],
    props.platform,
    props.defaultShell
  )

  function commit(next: TerminalConfig) {
    updateConfig(props.machine, { ...props.config, terminal: next })
  }

  return (
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
                  <span className="text-muted-foreground">(this machine)</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Command">
        <ShellInput
          key={`${props.machine}-${platform}-command`}
          machine={props.machine}
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
      <Row
        label={
          <span className="flex items-center gap-1.5">
            Shell integration
            <Tooltip
              label={
                <div>
                  Tells the terminal where prompts and commands start and end.
                  <ul className="mt-1 list-disc pl-4">
                    <li>Click in the command line to move the cursor</li>
                    <li>
                      Ignore clipboard reads once the command that asked has
                      finished
                    </li>
                  </ul>
                </div>
              }
            >
              <span onClick={(event) => event.preventDefault()}>
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  aria-label="About shell integration"
                  className="text-muted-foreground size-3.5"
                />
              </span>
            </Tooltip>
          </span>
        }
      >
        <div className="flex items-center gap-3">
          {shellIssue !== null && (
            <span className="text-muted-foreground max-w-32 text-right text-xs sm:max-w-none">
              {shellIssue}
            </span>
          )}
          <Switch
            checked={shellIssue === null && terminal.behavior.shellIntegration}
            disabled={shellIssue !== null}
            onCheckedChange={(shellIntegration) =>
              commit({
                ...terminal,
                behavior: { ...terminal.behavior, shellIntegration },
              })
            }
          />
        </div>
      </Row>
      <IdentityRow
        identity={terminal.behavior.terminalIdentity}
        onChange={(terminalIdentity) =>
          commit({
            ...terminal,
            behavior: { ...terminal.behavior, terminalIdentity },
          })
        }
      />
    </Section>
  )
}
