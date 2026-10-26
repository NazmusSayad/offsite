import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { builtinFonts } from '@/features/terminal/config'
import type { EditorPrefs, Prefs } from '@/lib/prefs'
import { updatePrefs } from '@/lib/store'
import { NumberInput, Row, Section, TextInput } from './controls'

export function EditorPage(props: { prefs: Prefs }) {
  const editor = props.prefs.editor
  const [customFont, setCustomFont] = useState(
    !builtinFonts.some((font) => font.family === editor.font.family)
  )

  function commit(next: EditorPrefs) {
    updatePrefs({ ...props.prefs, editor: next })
  }

  function update<Key extends 'font' | 'cursor'>(
    key: Key,
    value: Partial<EditorPrefs[Key]>
  ) {
    commit({ ...editor, [key]: { ...editor[key], ...value } })
  }

  return (
    <>
      <Section title="Font">
        <Row label="Family">
          <Select
            value={customFont ? 'custom' : editor.font.family}
            onValueChange={(family) => {
              setCustomFont(family === 'custom')
              if (family !== 'custom') {
                update('font', { family })
              }
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
              value={editor.font.family}
              onCommit={(family) => update('font', { family })}
            />
          </Row>
        )}
        <Row label="Size">
          <NumberInput
            value={editor.font.size}
            step={0.5}
            onCommit={(size) => update('font', { size })}
          />
        </Row>
        <Row label="Line height">
          <NumberInput
            value={editor.font.lineHeight}
            step={0.05}
            onCommit={(lineHeight) => update('font', { lineHeight })}
          />
        </Row>
        <Row label="Ligatures">
          <Switch
            checked={editor.font.ligatures}
            onCheckedChange={(ligatures) => update('font', { ligatures })}
          />
        </Row>
        <Row label="Font features">
          <TextInput
            placeholder="'ss01', 'zero'"
            value={editor.font.features}
            onCommit={(features) => update('font', { features })}
          />
        </Row>
      </Section>
      <Section title="Cursor">
        <Row label="Style">
          <Select
            value={editor.cursor.style}
            onValueChange={(style: EditorPrefs['cursor']['style']) =>
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
            checked={editor.cursor.blink}
            onCheckedChange={(blink) => update('cursor', { blink })}
          />
        </Row>
      </Section>
      <Section title="Text">
        <Row label="Tab size">
          <NumberInput
            value={editor.tabSize}
            onCommit={(tabSize) => commit({ ...editor, tabSize })}
          />
        </Row>
        <Row label="Word wrap">
          <Switch
            checked={editor.wordWrap}
            onCheckedChange={(wordWrap) => commit({ ...editor, wordWrap })}
          />
        </Row>
      </Section>
      <Section title="Tabs">
        <Row label="Open files in preview tabs">
          <Switch
            checked={editor.preview}
            onCheckedChange={(preview) => commit({ ...editor, preview })}
          />
        </Row>
      </Section>
    </>
  )
}
