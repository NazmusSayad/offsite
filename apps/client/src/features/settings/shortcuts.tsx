import { isMac, mod } from '@/lib/utils'
import { Row, Section } from './controls'

const terminalMod = isMac ? '⌘' : 'Ctrl+Shift'

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
  [`${mod}+Shift+M`, 'Choose the model'],
  [`${mod}+Shift+E`, 'Choose the effort'],
  [`${mod}+F`, 'Find in the thread'],
  [`${mod}+K`, 'Search sessions and actions'],
  [`${mod}+1…9`, 'Open a session from the sidebar'],
  [`${mod}+N or ${mod}+T`, 'New thread'],
  [isMac ? '⌘+` or Ctrl+`' : 'Ctrl+`', 'Toggle the terminal'],
  [`${mod}+B or ${mod}+Shift+J`, 'Toggle the sidebar'],
  [`${mod}+J or ${mod}+Shift+B`, 'Toggle the right panel'],
  [`${terminalMod}+T`, 'New terminal tab, in the terminal'],
  [`${terminalMod}+W`, 'Close the terminal tab'],
  [`${terminalMod}+F`, 'Find in the terminal'],
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
