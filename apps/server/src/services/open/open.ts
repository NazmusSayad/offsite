import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { serverDir } from '../../args.ts'
import { home } from '../../storage/storage.ts'

export const openSecret = randomBytes(32).toString('base64url')
let env: Record<string, string> = {}

export function openEnv() {
  return env
}

export function installOpen(host: string, port: number) {
  if (process.platform === 'win32') {
    return
  }
  mkdirSync(path.join(home, 'bin'), { recursive: true })
  const folder = realpathSync(path.join(home, 'bin'))
  const script = path.join(folder, 'open.mjs')
  writeFileSync(
    script,
    readFileSync(path.join(serverDir, 'src/services/open/open.mjs'))
  )
  for (const name of ['open', 'xdg-open', 'wslview']) {
    const wrapper = path.join(folder, name)
    writeFileSync(
      wrapper,
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(script)} ${name} "$@"\n`
    )
    chmodSync(wrapper, 0o755)
  }
  const startup = path.join(folder, 'env.sh')
  writeFileSync(startup, `export PATH=${quote(folder)}:"$PATH"\n`)
  env = {
    PATH:
      process.env.PATH === undefined
        ? folder
        : `${folder}${path.delimiter}${process.env.PATH}`,
    BROWSER: path.join(
      folder,
      process.platform === 'darwin' ? 'open' : 'xdg-open'
    ),
    OFFSITE_OPEN_URL: `http://${loopback(host)}:${port}/api/open/${openSecret}`,
    CLAUDE_ENV_FILE: startup,
    BASH_ENV: startup,
  }
}

function loopback(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1'
  }
  if (host === '::') {
    return '[::1]'
  }
  if (host.includes(':')) {
    return `[${host}]`
  }
  return host
}

function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}
