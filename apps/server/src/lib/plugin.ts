import path from 'node:path'
import { serverDir } from '../args.ts'
import { readConfig } from '../storage/config.ts'

export function offsitePlugin() {
  return readConfig().offsiteSkills ? path.join(serverDir, 'plugin') : null
}
