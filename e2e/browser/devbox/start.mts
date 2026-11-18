import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'
import { apps } from '../apps.mts'

type State = {
  state: 'starting' | 'ready' | 'failed'
  url: string
  error: string
  log: string[]
}

const root = '/apps'
const data = '/data/offsite'
const probes = path.join(import.meta.dirname, 'probes')
const repo = '/opt/offsite-repo'
const source = process.env.OFFSITE_SOURCE
const run = promisify(execFile)
const states: Record<string, State> = {}
let version = ''
let done = false

function track(name: string, child: ChildProcess) {
  const state = states[name]
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      for (const line of String(chunk).split('\n')) {
        if (line.trim() !== '') {
          state.log.push(line)
          console.log(`[${name}] ${line}`)
        }
      }
      state.log.splice(0, Math.max(0, state.log.length - 300))
    })
  }
}

async function exec(name: string, args: string[], cwd: string) {
  const child = spawn(args[0], args.slice(1), {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  track(name, child)
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  if (code !== 0) {
    throw new Error(`${args.join(' ')} exited with ${code}`)
  }
}

function serve(name: string, args: string[], cwd: string) {
  const child = spawn(args[0], args.slice(1), {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  track(name, child)
  child.on('exit', (code) => {
    states[name].state = 'failed'
    states[name].error = `${args.join(' ')} exited with ${code}`
  })
}

async function answers(name: string, port: number | string, page: string) {
  const deadline = Date.now() + 10 * 60_000
  const failures = new Map<string, string>()
  while (Date.now() < deadline) {
    if (states[name].state === 'failed') {
      throw new Error(states[name].error)
    }
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      const url = `http://${host}:${port}${page}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      }).catch((error: Error) => {
        failures.set(host, `${error.message} ${String(error.cause)}`)
        return null
      })
      if (response !== null && response.status < 500) {
        console.log(`[${name}] ${url} answered ${response.status}`)
        return
      }
      if (response !== null) {
        failures.set(host, `answered ${response.status}`)
      }
    }
    await sleep(2000)
  }
  throw new Error(
    `port ${port} did not answer ${page} in 10 minutes: ${[...failures].map((entry) => `${entry[0]} ${entry[1]}`).join('; ')}`
  )
}

async function step(name: string, url: string, work: () => Promise<void>) {
  states[name] = { state: 'starting', url, error: '', log: [] }
  try {
    await work()
    states[name].state = 'ready'
  } catch (error) {
    states[name].state = 'failed'
    states[name].error = String(error)
  }
}

async function startApp(app: (typeof apps)[number]) {
  const folder = path.join(root, `probe-${app.name}`)
  const url = `http://localhost:${app.port}`
  await step(app.name, url, async () => {
    await exec(app.name, app.create, root)
    cpSync(path.join(probes, app.name), folder, { recursive: true })
    await exec(app.name, ['npm', 'install'], folder)
    serve(app.name, app.dev, folder)
    await answers(app.name, app.port, app.probe)
  })
}

async function startOffsite() {
  await step('offsite', 'http://localhost:47841', async () => {
    await exec(
      'offsite',
      [
        'npm',
        'install',
        '--global',
        offsitePackage(),
        '@anthropic-ai/claude-code@latest',
      ],
      '/'
    )
    version = (await run('offsite', ['--version'])).stdout.trim()
    serve(
      'offsite',
      ['offsite', '--host', '0.0.0.0', '--port', '47841', '--dir', data],
      '/'
    )
    await answers('offsite', 47841, '/')
  })
  if (states.offsite.state !== 'ready') {
    return
  }
  const folder = path.join(root, 'offsite')
  await step('offsite-dev', '', async () => {
    await exec('offsite-dev', offsiteClone(folder), root)
    await exec('offsite-dev', ['pnpm', 'install', '--frozen-lockfile'], folder)
    serve('offsite-dev', ['pnpm', 'dev'], folder)
    const deadline = Date.now() + 60_000
    let port: string | undefined
    while (port === undefined && Date.now() < deadline) {
      await sleep(1000)
      port = states['offsite-dev'].log
        .join('\n')
        .match(/web on port (\d+)/)?.[1]
    }
    if (port === undefined) {
      throw new Error('pnpm dev printed no web port')
    }
    states['offsite-dev'].url = `http://localhost:${port}/`
    await answers('offsite-dev', port, '/')
  })
}

function offsitePackage() {
  if (source === 'npm') {
    return 'offsite@latest'
  }
  if (source === 'repo') {
    return path.join(repo, 'dist', 'offsite-0.0.0.tgz')
  }
  throw new Error(`Unknown OFFSITE_SOURCE ${source}`)
}

function offsiteClone(folder: string) {
  if (source === 'npm') {
    return [
      'git',
      'clone',
      '--depth',
      '1',
      '--branch',
      `v${version}`,
      'https://github.com/NazmusSayad/offsite',
      folder,
    ]
  }
  if (source === 'repo') {
    return ['git', '-c', 'safe.directory=*', 'clone', repo, folder]
  }
  throw new Error(`Unknown OFFSITE_SOURCE ${source}`)
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function pairCode() {
  const output = (await run('offsite', ['pair', '--dir', data])).stdout
  const code = output.match(/code=([\w-]+)/)?.[1]
  if (code === undefined) {
    throw new Error(`offsite pair printed no code:\n${output}`)
  }
  return code
}

function edit(name: string | null, to: string | null) {
  const app = apps.find((item) => item.name === name)
  if (app === undefined) {
    throw new Error(`Unknown app ${name}`)
  }
  if (to !== 'edited' && to !== 'original') {
    throw new Error(`Unknown edit ${to}`)
  }
  const file = path.join(root, `probe-${app.name}`, app.edit)
  const from = to === 'edited' ? 'Probe original' : 'Probe edited'
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, `Probe ${to}`))
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://devbox')
  try {
    if (url.pathname === '/status') {
      send(response, 200, { version, done, states })
      return
    }
    if (url.pathname === '/pair') {
      send(response, 200, { code: await pairCode() })
      return
    }
    if (url.pathname === '/edit' && request.method === 'POST') {
      edit(url.searchParams.get('app'), url.searchParams.get('to'))
      send(response, 200, {})
      return
    }
    send(response, 404, { error: `No ${request.method} ${url.pathname}` })
  } catch (error) {
    send(response, 500, { error: String(error) })
  }
}).listen(9999, '0.0.0.0')

await Promise.all([startOffsite(), ...apps.map(startApp)])
done = true
console.log(
  Object.entries(states)
    .map((entry) => `${entry[0]}: ${entry[1].state} ${entry[1].error}`)
    .join('\n')
)
