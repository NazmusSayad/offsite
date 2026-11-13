import { execFileSync, execSync } from 'node:child_process'
import { cpSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const output = path.join(root, 'dist', 'binary')
const stage = path.join(output, 'stage')
const app = path.join(stage, 'app')
const systems: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'windows',
}
const system = systems[process.platform]
if (system === undefined) {
  throw new Error(`offsite has no binary build for ${process.platform}`)
}
if (process.arch !== 'x64' && process.arch !== 'arm64') {
  throw new Error(`offsite has no binary build for ${process.arch}`)
}
const name = `offsite-${system}-${process.arch}`
const executable = process.platform === 'win32' ? 'offsite.exe' : 'offsite'
const launcher = `const path = require('node:path')
const { pathToFileURL } = require('node:url')
const vm = require('node:vm')

function load(file) {
  return vm.runInThisContext(
    'import(' + JSON.stringify(pathToFileURL(file).href) + ')',
    { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }
  )
}

const [mode, value] = process.argv.slice(2)
if (mode === '--node-eval') {
  eval(value)
} else {
  load(path.join(path.dirname(process.execPath), 'app', 'apps', 'server', 'dist', 'main.mjs'))
}
`

rmSync(output, { recursive: true, force: true })
cpSync(path.join(root, 'dist', 'npm'), app, { recursive: true })
execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
  cwd: app,
  stdio: 'inherit',
})
const scope = path.join(app, 'node_modules', '@anthropic-ai')
for (const entry of readdirSync(scope)) {
  if (entry.startsWith('claude-agent-sdk-')) {
    rmSync(path.join(scope, entry), { recursive: true })
  }
}

writeFileSync(path.join(output, 'launcher.cjs'), launcher)
writeFileSync(
  path.join(output, 'sea.json'),
  JSON.stringify({
    main: path.join(output, 'launcher.cjs'),
    output: path.join(stage, executable),
    disableExperimentalSEAWarning: true,
  })
)
execFileSync(process.execPath, ['--build-sea', path.join(output, 'sea.json')], {
  stdio: 'inherit',
})
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--sign', '-', path.join(stage, executable)], {
    stdio: 'inherit',
  })
}

const archive = path.join(
  output,
  process.platform === 'win32' ? `${name}.zip` : `${name}.tar.gz`
)
execFileSync(
  'tar',
  [
    process.platform === 'win32' ? '-a' : '-z',
    '-c',
    '-f',
    archive,
    '-C',
    stage,
    executable,
    'app',
  ],
  { stdio: 'inherit' }
)
console.log(`binary written to ${archive}`)
