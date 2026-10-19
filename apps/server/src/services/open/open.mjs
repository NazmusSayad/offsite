import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const command = process.argv[2]
const targets = process.argv.slice(3)
const file = targets.length === 1 ? localFile(targets[0]) : null

if (file !== null && statSync(file, { throwIfNoEntry: false })?.isFile()) {
  if (process.env.OFFSITE_OPEN_URL === undefined) {
    console.error(`${command}: OFFSITE_OPEN_URL is not set`)
    process.exit(1)
  }
  const response = await fetch(process.env.OFFSITE_OPEN_URL, {
    method: 'POST',
    body: JSON.stringify({ path: file }),
  })
  if (!response.ok) {
    console.error(`${command}: ${await response.text()}`)
    process.exit(1)
  }
  process.exit(0)
}

const folder = path.dirname(fileURLToPath(import.meta.url))
const real = (process.env.PATH ?? '')
  .split(path.delimiter)
  .filter((dir) => dir !== '' && path.resolve(dir) !== folder)
  .map((dir) => path.join(dir, command))
  .find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile())
if (real === undefined) {
  console.error(`${command}: command not found`)
  process.exit(127)
}
const result = spawnSync(real, targets, { stdio: 'inherit' })
if (result.error !== undefined) {
  throw result.error
}
process.exit(result.status ?? 1)

function localFile(target) {
  if (target.startsWith('file:')) {
    return fileURLToPath(target)
  }
  if (target.startsWith('-') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return null
  }
  return path.resolve(target)
}
