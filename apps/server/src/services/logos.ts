import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { git, projectRepos } from './git.ts'

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
  const repos = await projectRepos(folder)
  const tracked = await Promise.all(
    repos.map(async (repo) => {
      const output = await git(path.join(folder, repo), ['ls-files', '-z'])
      return output.stdout
        .split('\0')
        .map((file) => (repo === '' ? file : `${repo}/${file}`))
    })
  )
  const candidates = tracked
    .flat()
    .map((file) => ({ file, rank: logoRank(file) }))
    .filter((candidate) => candidate.rank !== -1)
    .sort((a, b) => a.rank - b.rank || a.file.length - b.file.length)
  for (const { file } of candidates) {
    const full = path.join(folder, file)
    if (!existsSync(full)) {
      continue
    }
    const type = LOGO_FILES.get(path.extname(file).toLowerCase())
    const data = await readFile(full)
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
