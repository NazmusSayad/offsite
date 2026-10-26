import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { listFiles } from './files.ts'
import { git, projectRepos } from './git.ts'

const LOGO_LIMIT = 512 * 1024
const LOGO_SIZE = 256
const RESIZED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const KEPT_TYPES = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
const PICKABLE_FILE = /\.(png|jpe?g|webp|svg)$/i
const LOGO_FILES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
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
    try {
      return await prepareLogo(`data:${type};base64,${data.toString('base64')}`)
    } catch {
      continue
    }
  }
  return null
}

export async function logoFiles(folder: string) {
  const repos = await projectRepos(folder)
  if (repos.length === 0) {
    return (await listFiles(folder)).filter((file) => PICKABLE_FILE.test(file))
  }
  const listed = await Promise.all(
    repos.map(async (repo) => {
      const output = await git(path.join(folder, repo), [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
      ])
      return output.stdout
        .split('\0')
        .map((file) => (repo === '' ? file : `${repo}/${file}`))
    })
  )
  return [...new Set(listed.flat())].filter(
    (file) => PICKABLE_FILE.test(file) && existsSync(path.join(folder, file))
  )
}

export async function prepareLogo(logo: string) {
  const header = /^data:([^;,]+);base64,/.exec(logo)
  if (header !== null && RESIZED_TYPES.includes(header[1])) {
    const resized = await sharp(
      Buffer.from(logo.slice(header[0].length), 'base64')
    )
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer()
    return `data:image/webp;base64,${resized.toString('base64')}`
  }
  if (header !== null && KEPT_TYPES.includes(header[1])) {
    if (logo.length > LOGO_LIMIT) {
      throw new Error('Use an SVG or ICO image smaller than 384 KB')
    }
    return logo
  }
  throw new Error('Use a PNG, JPEG, WebP, SVG or ICO image')
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
