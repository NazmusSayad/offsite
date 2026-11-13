import { mod } from '@/lib/utils'
import { Row, Section } from './controls'

const shortcuts = [
  ['Enter', 'Send, or queue or steer while the agent works'],
  [`${mod}+Enter`, 'Send the other way while the agent works'],
  ['Shift+Enter', 'New line'],
  ['↑', 'Recall your last message'],
  ['Esc', 'Stop the agent'],
  ['/', 'Slash commands'],
  ['@', 'Mention a file'],
  [`${mod}+S`, 'Stash the prompt, or bring back the last stash'],
  [`${mod}+Shift+V`, 'Paste long text inline instead of as a file'],
  [`${mod}+Shift+D`, 'Start or stop dictation'],
  [`${mod}+. or ${mod}+Shift+M`, 'Choose the model'],
  [`${mod}+/ or ${mod}+Shift+E`, 'Choose the effort'],
  [`${mod}+P`, 'Choose the sidebar scope'],
  [`${mod}+;`, 'Choose the project of a new thread'],
  [`${mod}+F`, 'Find in the thread'],
  [`${mod}+K or ${mod}+Shift+P`, 'Search sessions and actions'],
  [`${mod}+,`, 'Open settings'],
  [`${mod}+1…9`, 'Open a session from the sidebar'],
  [`${mod}+N`, 'New thread'],
  [
    `${mod}+T, ${mod}+Shift+T or ${mod}+Shift+\``,
    'Search terminals, or open a new one',
  ],
  [`${mod}+\``, 'Toggle the terminal'],
  [`${mod}+B or ${mod}+Shift+B`, 'Toggle the right panel'],
  [`${mod}+E or ${mod}+J`, 'Toggle the editor'],
  [`${mod}+T`, 'New terminal tab, in the terminal'],
  [`${mod}+W or ${mod}+Shift+W`, 'Close the terminal tab'],
  [`${mod}+F`, 'Find in the terminal'],
  ['Ctrl+Tab', 'Next terminal tab'],
  ['Ctrl+Shift+Tab', 'Previous terminal tab'],
]

export function ShortcutsPage() {
  return (
    <Section title="Keyboard shortcuts">
      {shortcuts.map(([keys, action]) => (
        <Row key={keys} label={action}>
          <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-sans text-xs">
            {keys}
          </kbd>
        </Row>
      ))}
    </Section>
  )
}
