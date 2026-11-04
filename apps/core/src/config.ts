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

export type Config = {
  claudeBaseDir: Record<Platform, string | null>
  workingDir: Record<Platform, string | null>
  claudeAccounts: AccountConfig[]
  codexAccounts: AccountConfig[]
  enabledProviders: Record<Provider, boolean>
  commitMessage: GenerationModel
  titleGeneration: GenerationModel
  models: Record<Provider, Record<string, ModelSetting>>
  delivery: PromptDelivery
  autoSkipQuestionTimeout: number | null
  autoPermissionMode: 'bypass' | 'allow' | 'deny'
  autoPermissionTimeout: number | null
  terminal: TerminalConfig
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
