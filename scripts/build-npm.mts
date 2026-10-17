import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const output = path.join(root, 'dist', 'npm')
const server = JSON.parse(
  readFileSync(path.join(root, 'apps', 'server', 'package.json'), 'utf8')
)

const manifest = {
  name: 'offsite',
  version: '0.0.0',
  type: 'module',
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/NazmusSayad/offsite.git',
  },
  bin: { offsite: 'bin/offsite.js' },
  engines: { node: '>=24' },
  dependencies: server.dependencies,
}

for (const folder of [
  ['apps', 'server', 'dist'],
  ['apps', 'server', 'drizzle'],
  ['apps', 'server', 'src', 'services', 'terminal', 'shell-integration'],
  ['apps', 'web', 'dist'],
])
  cpSync(path.join(root, ...folder), path.join(output, ...folder), {
    recursive: true,
  })
mkdirSync(path.join(output, 'bin'), { recursive: true })
writeFileSync(
  path.join(output, 'bin', 'offsite.js'),
  "#!/usr/bin/env node\nimport '../apps/server/dist/main.mjs'\n"
)
cpSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'))
cpSync(path.join(root, 'README.md'), path.join(output, 'README.md'))
writeFileSync(
  path.join(output, 'package.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
)
console.log(`npm package written to ${output}`)
