export const packageManagers = [
  'mise-github',
  'mise-npm',
  'npm',
  'pnpm',
  'bun',
] as const

export type PackageManager = (typeof packageManagers)[number]

export type ServiceSettings = {
  manager: PackageManager
  arguments: string[]
}

export type ServiceUpdate =
  | { version: string; status: 'available' | 'ready' }
  | {
      version: string
      status: 'downloading'
      output: string | null
      percent: number | null
    }

export type ServiceState = {
  installed: boolean
  update: ServiceUpdate | null
  manager: PackageManager | null
  arguments: string[]
}
