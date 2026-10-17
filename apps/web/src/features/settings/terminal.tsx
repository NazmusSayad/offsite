import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { imagePasteKeys } from '@/features/terminal/clipboard'
import { builtinFonts } from '@/features/terminal/config'
import type { Prefs, TerminalPrefs } from '@/lib/prefs'
import { updatePrefs } from '@/lib/store'
import { isMac } from '@/lib/utils'
import { NumberInput, Row, Section, TextInput } from './controls'

type Behavior = TerminalPrefs['behavior']

export function TerminalPage(props: { prefs: Prefs }) {
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

function BehaviorSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Behavior">
      <Row label="Modernize Shift+Enter">
        <Switch
          checked={props.behavior.modernizeShiftEnter}
          onCheckedChange={(modernizeShiftEnter) =>
            props.onChange({ modernizeShiftEnter })
          }
        />
      </Row>
      <Row
        label={`${imagePasteKeys.linux.label} (${imagePasteKeys.windows.label} on Windows machines) pastes images from the browser clipboard`}
      >
        <Switch
          checked={props.behavior.pasteBrowserImages}
          onCheckedChange={(pasteBrowserImages) =>
            props.onChange({ pasteBrowserImages })
          }
        />
      </Row>
      <Row label="Capture browser shortcuts">
        <Switch
          checked={props.behavior.captureShortcuts}
          onCheckedChange={(captureShortcuts) =>
            props.onChange({ captureShortcuts })
          }
        />
      </Row>
      <Row label="Click moves the cursor in the command line">
        <Switch
          checked={props.behavior.clickToMoveCursor}
          onCheckedChange={(clickToMoveCursor) =>
            props.onChange({ clickToMoveCursor })
          }
        />
      </Row>
      <Row label="Ask before closing a tab that is running a program">
        <Switch
          checked={props.behavior.confirmCloseBusyTab}
          onCheckedChange={(confirmCloseBusyTab) =>
            props.onChange({ confirmCloseBusyTab })
          }
        />
      </Row>
    </Section>
  )
}

function MacKeysSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  if (!isMac) return null
  return (
    <Section
      title="Mac keys"
      note="Meta keeps that Option key from typing @, | and other symbols. Safari and Firefox use US key positions"
    >
      <Row label="Use Option as Meta">
        <Select
          value={props.behavior.optionAsMeta}
          onValueChange={(optionAsMeta: Behavior['optionAsMeta']) =>
            props.onChange({ optionAsMeta })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="left">Left Option</SelectItem>
            <SelectItem value="right">Right Option</SelectItem>
            <SelectItem value="both">Both Options</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </Section>
  )
}
