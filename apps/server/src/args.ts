import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '47841' },
    dir: { type: 'string', default: path.join(os.homedir(), '.offsite') },
  },
})

export const args = { ...values, dir: path.resolve(values.dir) }

export const serverDir = path.join(import.meta.dirname, '..')
