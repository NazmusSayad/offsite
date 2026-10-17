import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Directories, Project, ProjectPatch } from '@offsite/core/protocol'
import { eq } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { projects as projectsTable } from '../storage/schema.ts'

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

export function projects(): Project[] {
  return db.select().from(projectsTable).all()
}

export function projectPath(id: string) {
  const project = db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id))
    .get()
  if (project === undefined) {throw new Error('That project was removed')}
  return project.path
}

export async function addProject(input: string) {
  const folder = path.resolve(expandHome(input.trim()))
  if (!(await stat(folder)).isDirectory())
    {throw new Error(`${folder} is not a folder`)}
  db.insert(projectsTable)
    .values({
      id: randomUUID(),
      path: folder,
      name: path.basename(folder) || folder,
      logo: null,
    })
    .onConflictDoNothing({ target: projectsTable.path })
    .run()
  publish()
  const project = projects().find((item) => item.path === folder)
  if (project === undefined) {throw new Error(`Could not add ${folder}`)}
  return project
}

export function updateProject(id: string, patch: ProjectPatch) {
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name === '') {throw new Error('Project name cannot be empty')}
    db.update(projectsTable).set({ name }).where(eq(projectsTable.id, id)).run()
  }
  if (patch.logo !== undefined) {
    if (patch.logo !== null) {checkLogo(patch.logo)}
    db.update(projectsTable)
      .set({ logo: patch.logo })
      .where(eq(projectsTable.id, id))
      .run()
  }
  publish()
  return null
}

export function removeProject(id: string) {
  db.delete(projectsTable).where(eq(projectsTable.id, id)).run()
  publish()
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

function checkLogo(logo: string) {
  const type = /^data:([^;,]+);base64,/.exec(logo)?.[1]
  if (type === undefined || !LOGO_TYPES.includes(type))
    {throw new Error('Use a PNG, JPEG, GIF, WebP, SVG or ICO image')}
  if (logo.length > LOGO_LIMIT)
    {throw new Error('Use an image smaller than 384 KB')}
}

function expandHome(input: string) {
  if (input === '~') {return os.homedir()}
  if (input.startsWith('~/')) {return path.join(os.homedir(), input.slice(2))}
  return input
}
