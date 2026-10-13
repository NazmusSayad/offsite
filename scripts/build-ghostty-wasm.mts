import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const revision = '9f62873bf195e4d8a762d768a1405a5f2f7b1697'
const zig = 'zig@0.15.2'
const folder = path.join(
  import.meta.dirname,
  '..',
  'apps',
  'web',
  'src',
  'ghostty'
)
const work = mkdtempSync(path.join(tmpdir(), 'ghostty-'))

function run(command: string, args: string[]) {
  execFileSync(command, args, { cwd: work, stdio: 'inherit' })
}

try {
  run('git', ['init', '--quiet'])
  run('git', [
    'fetch',
    '--quiet',
    '--depth',
    '1',
    'https://github.com/ghostty-org/ghostty.git',
    revision,
  ])
  run('git', ['checkout', '--quiet', 'FETCH_HEAD'])
  run('git', ['apply', path.join(folder, 'kitty-graphics.patch')])
  run('mise', [
    'exec',
    zig,
    '--',
    'zig',
    'build',
    '-Demit-lib-vt',
    '-Dtarget=wasm32-freestanding',
    '-Doptimize=ReleaseSmall',
    '-Dstrip=true',
    `-Dlib-version-string=0.1.0-dev+${revision}`,
    '-p',
    'out',
  ])
  const output = path.join(folder, 'ghostty-vt.wasm')
  copyFileSync(path.join(work, 'out', 'bin', 'ghostty-vt.wasm'), output)
  const hash = createHash('sha256').update(readFileSync(output)).digest('hex')
  console.log(`ghostty-vt.wasm written to ${output}`)
  console.log(`SHA-256 ${hash}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
