import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  DirectoryListing,
  Project,
  ProjectPatch,
} from '@offsite/core/projects'
import { eq, max } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { projects as projectsTable } from '../storage/schema.ts'
import { findLogo, prepareLogo } from './logos.ts'

export function projects(): Project[] {
  return db
    .select({
      id: projectsTable.id,
      path: projectsTable.path,
      name: projectsTable.name,
      logo: projectsTable.logo,
      hidden: projectsTable.hidden,
    })
    .from(projectsTable)
    .orderBy(projectsTable.position)
    .all()
}

export function projectPath(id: string) {
  const project = db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id))
    .get()
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  return project.path
}

export async function addProject(input: string) {
  const folder = path.resolve(expandHome(input.trim()))
  if (!(await stat(folder)).isDirectory()) {
    throw new Error(`${folder} is not a folder`)
  }
  const last = db
    .select({ position: max(projectsTable.position) })
    .from(projectsTable)
    .get()
  db.insert(projectsTable)
    .values({
      id: randomUUID(),
      path: folder,
      name: path.basename(folder) || folder,
      logo: await findLogo(folder),
      position:
        last === undefined || last.position === null ? 0 : last.position + 1,
    })
    .onConflictDoNothing({ target: projectsTable.path })
    .run()
  publish()
  const project = projects().find((item) => item.path === folder)
  if (project === undefined) {
    throw new Error(`Could not add ${folder}`)
  }
  return project
}

export async function updateProject(id: string, patch: ProjectPatch) {
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name === '') {
      throw new Error('Project name cannot be empty')
    }
    db.update(projectsTable).set({ name }).where(eq(projectsTable.id, id)).run()
  }
  if (patch.logo !== undefined) {
    db.update(projectsTable)
      .set({
        logo: patch.logo === null ? null : await prepareLogo(patch.logo),
      })
      .where(eq(projectsTable.id, id))
      .run()
  }
  if (patch.hidden !== undefined) {
    db.update(projectsTable)
      .set({ hidden: patch.hidden })
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

export function reorderProjects(ids: string[]) {
  const current = projects().map((project) => project.id)
  if (
    ids.length !== current.length ||
    !current.every((id) => ids.includes(id))
  ) {
    throw new Error('The projects changed, try again')
  }
  db.transaction((transaction) => {
    ids.forEach((id, position) => {
      transaction
        .update(projectsTable)
        .set({ position })
        .where(eq(projectsTable.id, id))
        .run()
    })
  })
  publish()
  return null
}

export async function directories(input: string): Promise<DirectoryListing> {
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

function expandHome(input: string) {
  if (input === '~') {
    return os.homedir()
  }
  if (input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2))
  }
  return input
}
