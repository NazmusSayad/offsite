import type { Provider } from '@offsite/core/protocol'

export const deprecatedModels: Record<Provider, string[]> = {
  claude: [
    'claude-sonnet-5',
    'claude-opus-5',
    'claude-fable-5',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
  ],
  codex: [],
  opencode: [],
}

export const defaultModels: Record<Provider, string | null> = {
  claude: 'claude-opus-5-5',
  codex: null,
  opencode: null,
}
