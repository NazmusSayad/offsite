export type Provider = 'claude' | 'codex' | 'opencode'

export type RateLimit = {
  window: string
  utilization: number | null
  resetsAt: number | null
  rejected: boolean
}

export type ProviderStatus = {
  provider: Provider
  state: 'loading' | 'ready' | 'missing' | 'error' | 'disabled'
  error: string | null
}

export type Account = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  color: string
  configDir: string | null
  enabled: boolean
  hiddenModels: Record<string, boolean>
  email: string | null
  plan: string | null
  error: string | null
  limits: RateLimit[]
  linked: boolean
  valid: boolean
}

export type Accounts = {
  claudeAccounts: Account[]
  codexAccounts: Account[]
  openCode: { available: boolean }
}

export type Model = {
  value: string
  name: string
  description: string
  efforts: string[]
  deprecated: boolean
  hidden: boolean
  effort: string | null
}

export type SlashCommand = { name: string; description: string; hint: string }

export type Agent = { id: string; name: string; description: string }

export type Capabilities = {
  models: Model[]
  defaultModel: string | null
  commands: SlashCommand[]
  agents: Agent[]
}

export type ProviderCapabilities = Omit<
  Capabilities,
  'models' | 'defaultModel'
> & {
  models: Omit<Model, 'deprecated' | 'hidden' | 'effort'>[]
}
