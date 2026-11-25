declare module 'playwright-core/lib/coreBundle' {
  type Executable = { executablePath(): string }

  export const registry: {
    registry: {
      findExecutable(name: string): Executable | undefined
      install(
        executables: Executable[],
        options: { force: boolean; gc: boolean }
      ): Promise<void>
    }
  }
}
