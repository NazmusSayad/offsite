import type { Provider } from './providers.ts'

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
  hiddenModels: Record<string, boolean>
}

export type ComposerSettings = { provider: Provider } & Record<
  Provider,
  ProviderSettings
>

export type Config = {
  claudeBaseDir: Record<Platform, string | null>
  workingDir: Record<Platform, string | null>
  claudeAccounts: AccountConfig[]
  codexAccounts: AccountConfig[]
  enabledProviders: Record<Provider, boolean>
  commitMessage: {
    provider: Provider | null
    accountId: string | null
    model: string | null
  }
  models: Record<Provider, Record<string, ModelSetting>>
  delivery: PromptDelivery
  autoSkipQuestionTimeout: number | null
  autoPermissionMode: 'allow' | 'deny'
  autoPermissionTimeout: number | null
  terminal: TerminalConfig
}

export type ConfigWithDefaults = {
  config: Config
  defaults: Config
  platform: Platform
  defaultShell: string
  defaultClaudeBaseDir: string
}

export type PromptDelivery = 'queue' | 'steer'
