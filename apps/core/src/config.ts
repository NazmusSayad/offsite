import type { Provider } from './providers.ts'

export const DEFAULT_PROVIDER = 'claude'
export const DEFAULT_CLAUDE_PERMISSION_MODE = 'bypassPermissions'
export const DEFAULT_CODEX_PERMISSION_MODE = 'full-access'

export type ModelSetting = { hidden: boolean; effort: string | null }

export type ProviderSettings = {
  accountId: string | null
  model: string | null
  effort: string | null
  mode: string | null
  plan: boolean
}

export type SessionSettings = ProviderSettings & { provider: Provider }

export type Platform = 'macos' | 'linux' | 'windows'

export type TerminalIdentity = 'offsite' | 'ghostty' | 'iterm2'

export type TerminalConfig = {
  shell: Record<Platform, string | null>
  behavior: { terminalIdentity: TerminalIdentity; shellIntegration: boolean }
}

export type AccountConfig = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  color: string | null
  configDir: Record<Platform, string | null>
  enabled: boolean
}

export type LastUsedModel = {
  provider: Provider
  accountId: string | null
  model: string
  usedAt: number
}

export type GenerationModel = {
  provider: Provider | null
  accountId: string | null
  model: string | null
}

export type DictationConfig = {
  workflowId: string | null
}

export type Config = {
  version: 2
  claude: {
    enabled: boolean
    baseDir: Record<Platform, string | null>
    accounts: AccountConfig[]
    models: Record<string, ModelSetting>
  }
  codex: {
    enabled: boolean
    accounts: AccountConfig[]
    models: Record<string, ModelSetting>
  }
  opencode: {
    enabled: boolean
    models: Record<string, ModelSetting>
  }
  workingDir: Record<Platform, string | null>
  commitMessage: GenerationModel
  titleGeneration: GenerationModel
  delivery: PromptDelivery
  autoSkipQuestionTimeout: number | null
  autoPermissionMode: 'bypass' | 'allow' | 'deny'
  autoPermissionTimeout: number | null
  terminal: TerminalConfig
  dictation: DictationConfig
}

export type ConfigWithDefaults = {
  config: Config
  defaults: Config
  platform: Platform
  defaultShell: string
  defaultClaudeBaseDir: string
  homeDir: string
  scratchAvailable: boolean
}

export type PromptDelivery = 'queue' | 'steer'
