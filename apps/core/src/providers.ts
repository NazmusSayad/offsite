export type Provider = 'claude' | 'codex' | 'opencode'

export type RateLimit = {
  window: string
  utilization: number | null
  resetsAt: number | null
  rejected: boolean
}

export type Usage = {
  limits: RateLimit[]
  fetchedAt: number | null
  updatedAt: number | null
  error: string | null
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
  color: string | null
  configDir: string | null
  enabled: boolean
  email: string | null
  displayName: string | null
  organization: string | null
  identity: { accountId: string; organizationId: string } | null
  plan: string | null
  error: string | null
  linked: boolean
  fullyLinked: boolean
  valid: boolean
}

export type LinkAction = 'linked' | 'link' | 'relink' | 'replace' | 'backup'

export type LinkEntry = {
  type: 'folder' | 'json' | 'jsonl' | 'md'
  name: string
  required: boolean
  action: LinkAction
  createInBase: boolean
}

export type LinkPlan = {
  configDir: string
  baseDir: string
  entries: LinkEntry[]
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
