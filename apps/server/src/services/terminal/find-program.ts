import { lstatSync } from 'node:fs'
import path from 'node:path'

const found = new Map<string, string>()

export function findWindowsProgram(command: string) {
  if (/[\\/]/.test(command)) {
    return command
  }
  const cached = found.get(command)
  if (cached !== undefined) {
    return cached
  }
  const extensions =
    path.extname(command) === ''
      ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
      : ['']
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (directory === '') {
      continue
    }
    for (const extension of extensions) {
      const candidate = path.join(directory, command + extension)
      let entry
      try {
        entry = lstatSync(candidate, { throwIfNoEntry: false })
      } catch {
        continue
      }
      if (entry !== undefined && !entry.isDirectory()) {
        found.set(command, candidate)
        return candidate
      }
    }
  }
  throw new Error(`could not find ${command} in PATH`)
}
