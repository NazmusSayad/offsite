import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { git, isRepo } from './git.ts'

export const LOGO_LIMIT = 512 * 1024
const LOGO_FILES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
])
const PREFERRED = [
  'logo.svg',
  'logo.png',
  'logo.webp',
  'favicon.ico',
  'icon.svg',
  'icon.png',
  'icon.webp',
]

export async function findLogo(folder: string) {
  if (!(await isRepo(folder))) {
    return null
  }
  const tracked = await git(folder, ['ls-files', '-z'])
  const candidates = tracked.stdout
    .split('\0')
    .map((file) => ({ file, rank: logoRank(file) }))
    .filter((candidate) => candidate.rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.file.length - b.file.length)
  for (const { file } of candidates) {
    const type = LOGO_FILES.get(path.extname(file).toLowerCase())
    const data = await readFile(path.join(folder, file))
    const logo = `data:${type};base64,${data.toString('base64')}`
    if (logo.length <= LOGO_LIMIT) {
      return logo
    }
  }
  return null
}

function logoRank(file: string) {
  const preferred = PREFERRED.indexOf(path.basename(file).toLowerCase())
  if (preferred !== -1) {
    return preferred
  }
  const extension = path.extname(file).toLowerCase()
  if (!LOGO_FILES.has(extension)) {
    return -1
  }
  const words = path
    .basename(file, extension)
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
  if (
    words.includes('logo') ||
    words.includes('icon') ||
    words.includes('favicon')
  ) {
    return PREFERRED.length
  }
  return -1
}
