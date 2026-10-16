import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { SQLOutputValue } from 'node:sqlite'
import type { Directories, Project, ProjectPatch } from '@offsite/core/protocol'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'

const LOGO_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]
const LOGO_LIMIT = 512 * 1024

export function projects() {
  return db
    .prepare('SELECT path, name, logo FROM projects')
    .all()
    .map(toProject)
}

export async function addProject(input: string) {
  const folder = path.resolve(expandHome(input.trim()))
  if (!(await stat(folder)).isDirectory())
    throw new Error(`${folder} is not a folder`)
  db.prepare(
    'INSERT OR IGNORE INTO projects (path, name, logo) VALUES (?, ?, NULL)'
  ).run(folder, path.basename(folder) || folder)
  publish()
  const project = projects().find((item) => item.path === folder)
  if (project === undefined) throw new Error(`Could not add ${folder}`)
  return project
}

export function updateProject(folder: string, patch: ProjectPatch) {
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name === '') throw new Error('Project name cannot be empty')
    db.prepare('UPDATE projects SET name = ? WHERE path = ?').run(name, folder)
  }
  if (patch.logo !== undefined) {
    if (patch.logo !== null) checkLogo(patch.logo)
    db.prepare('UPDATE projects SET logo = ? WHERE path = ?').run(
      patch.logo,
      folder
    )
  }
  publish()
  return null
}

export function removeProject(folder: string) {
  db.prepare('DELETE FROM projects WHERE path = ?').run(folder)
  publish()
  return null
}

export async function directories(input: string): Promise<Directories> {
  const folder = path.resolve(expandHome(input.trim()))
  const entries = await readdir(folder, { withFileTypes: true })
  const parent = path.dirname(folder)
  return {
    path: folder,
    parent: parent === folder ? null : parent,
    directories: entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(folder, entry.name),
      }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
  }
}

function publish() {
  broadcast({ type: 'projects', projects: projects() })
}

function toProject(row: Record<string, SQLOutputValue>): Project {
  if (
    typeof row.path !== 'string' ||
    typeof row.name !== 'string' ||
    (typeof row.logo !== 'string' && row.logo !== null)
  )
    throw new Error('The projects table has an unexpected row')
  return { path: row.path, name: row.name, logo: row.logo }
}

function checkLogo(logo: string) {
  const type = /^data:([^;,]+);base64,/.exec(logo)?.[1]
  if (type === undefined || !LOGO_TYPES.includes(type))
    throw new Error('Use a PNG, JPEG, GIF, WebP, SVG or ICO image')
  if (logo.length > LOGO_LIMIT)
    throw new Error('Use an image smaller than 384 KB')
}

function expandHome(input: string) {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  return input
}
