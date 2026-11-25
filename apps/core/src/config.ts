import type { Provider } from './providers.ts'

export const DEFAULT_PROVIDER = 'claude'
export const DEFAULT_CLAUDE_PERMISSION_MODE = 'bypassPermissions'
export const DEFAULT_CODEX_PERMISSION_MODE = 'full-access'
export const CODEX_MODES = ['read-only', 'auto', 'full-access'] as const
export const DEFAULT_SMALL_MODELS: Record<
  Exclude<Provider, 'opencode'>,
  string
> = {
  claude: 'claude-haiku-5-5',
  codex: 'gpt-6-luna',
}

export type ModelSetting = { hidden: boolean }

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

export type LastPickedModelForProvider = {
  provider: Provider
  accountId: string | null
  model: string
  usedAt: number
}

export type LastMessageAtForAccount = {
  accountId: string
  sentAt: number
}

export type LastPickedEffortForModel = {
  provider: Provider
  model: string
  effort: string | null
  usedAt: number
}

export type DictationConfig = {
  workflowId: string | null
}

export type FinishedCheckConfig = {
  openRouterModel: string | null
  openRouterKeyEnv: string | null
}

export type Config = {
  version: 4
  claude: {
    enabled: boolean
    baseDir: Record<Platform, string | null>
    accounts: AccountConfig[]
    models: Record<string, ModelSetting>
    smallModel: string | null
  }
  codex: {
    enabled: boolean
    accounts: AccountConfig[]
    models: Record<string, ModelSetting>
    smallModel: string | null
    sideQuestMode: (typeof CODEX_MODES)[number]
  }
  opencode: {
    enabled: boolean
    models: Record<string, ModelSetting>
    smallModel: string | null
  }
  workingDir: Record<Platform, string | null>
  delivery: PromptDelivery
  autoSkipQuestionTimeout: number | null
  autoPermissionMode: 'bypass' | 'allow' | 'deny'
  autoPermissionTimeout: number | null
  offsiteSkills: boolean
  autoTitle: boolean
  terminal: TerminalConfig
  dictation: DictationConfig
  finishedCheck: FinishedCheckConfig
}

export type ConfigWithDefaults = {
  config: Config
  defaults: Config
  platform: Platform
  defaultShell: string
  defaultClaudeBaseDir: string
  homeDir: string
  version: string
}

export type PromptDelivery = 'queue' | 'steer'
