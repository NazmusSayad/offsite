import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { concurrently } from 'concurrently'
import getPort, { portNumbers } from 'get-port'

const options = parseArgs({
  options: { host: { type: 'string' }, connect: { type: 'string' } },
}).values

const loopback =
  options.host === undefined ||
  options.host === '0.0.0.0' ||
  options.host === '::'
    ? '127.0.0.1'
    : options.host

const dir = freeDir()
const webPort = await getPort({ port: portNumbers(7000, 9999) })
const port = await getPort({ port: portNumbers(webPort + 1, 9999) })

const server = `http://${loopback.includes(':') ? `[${loopback}]` : loopback}:${port}`
const connect = [
  ...(options.connect === undefined ? [] : options.connect.split(',')),
  server,
].join(',')

console.log(
  `offsite dev: ${dir}, web on port ${webPort}, server on port ${port}, connect ${connect}`
)

const apps = path.join(import.meta.dirname, '..', 'apps')
const host =
  options.host === undefined ? '' : ` --host ${JSON.stringify(options.host)}`

try {
  await concurrently(
    [
      {
        name: 'server',
        command: `node --watch-path=src src/main.ts --port ${port} --dir ${JSON.stringify(dir)} --no-auth${host}`,
        cwd: path.join(apps, 'server'),
        prefixColor: 'blue',
      },
      {
        name: 'client',
        command: `pnpm exec vite --port ${webPort} --strictPort${host}`,
        cwd: path.join(apps, 'client'),
        prefixColor: 'magenta',
        env: {
          OFFSITE_DEV_SERVER: server,
          OFFSITE_CONNECT: connect,
        },
      },
    ],
    { killOthersOn: ['failure', 'success'] }
  ).result
} catch {
  process.exit(1)
}

function freeDir() {
  for (let index = 1; ; index++) {
    const dir = path.join(
      os.homedir(),
      index === 1 ? '.offsite-dev' : `.offsite-dev-${index}`
    )
    if (!inUse(dir)) {
      return dir
    }
  }
}

function inUse(dir: string) {
  let pid
  try {
    pid = Number(readFileSync(path.join(dir, 'server.pid'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false
    }
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return true
    }
    throw error
  }
}
