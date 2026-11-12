export const packageManagers = ['mise', 'npm', 'pnpm', 'bun'] as const

export type PackageManager = (typeof packageManagers)[number]

export type ServiceSettings = {
  manager: PackageManager
  arguments: string[]
}

export type ServiceState = {
  installed: boolean
  update: string | null
  manager: PackageManager | null
  arguments: string[]
}
