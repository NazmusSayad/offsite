import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readdir, rmdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { WorktreeStage } from '@offsite/core/git'
import type {
  DirectoryListing,
  Project,
  ProjectPatch,
} from '@offsite/core/projects'
import { eq, max, or } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { projects as projectsTable } from '../storage/schema.ts'
import { home, scratchAvailable } from '../storage/storage.ts'
import { findLogo, prepareLogo } from './logos.ts'
import {
  createWorktree,
  removeCleanWorktree,
  removeWorktree,
  runSetup,
} from './worktrees.ts'

const scratchRoot = path.join(home, 'scratch')

export function projects(): Project[] {
  return db
    .select({
      id: projectsTable.id,
      path: projectsTable.path,
      name: projectsTable.name,
      logo: projectsTable.logo,
      hidden: projectsTable.hidden,
      scratch: projectsTable.scratch,
      parentId: projectsTable.parentId,
      worktreeSetup: projectsTable.worktreeSetup,
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
  db.insert(projectsTable)
    .values({
      id: randomUUID(),
      path: folder,
      name: path.basename(folder) || folder,
      logo: await findLogo(folder),
      position: nextPosition(),
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

export async function addScratchProject(text: string) {
  if (!scratchAvailable) {
    throw new Error(
      `Chats without a project are unavailable because ${home} is inside a Git repository`
    )
  }
  await mkdir(scratchRoot, { recursive: true })
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-')
    .slice(0, 48)
    .replace(/-+$/, '')
  const date = new Date().toLocaleDateString('en-CA')
  while (true) {
    const folder = path.join(
      scratchRoot,
      [date, words, randomBytes(4).toString('hex')].filter(Boolean).join('-')
    )
    try {
      await mkdir(folder)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        continue
      }
      throw error
    }
    const id = randomUUID()
    db.insert(projectsTable)
      .values({ id, path: folder, name: 'Chat', scratch: true })
      .run()
    publish()
    return { id, path: folder }
  }
}

export async function removeScratchProject(id: string, folder: string) {
  db.delete(projectsTable).where(eq(projectsTable.id, id)).run()
  publish()
  try {
    await rmdir(folder)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') {
      throw error
    }
  }
}

export async function addWorktreeProject(
  projectId: string,
  name: string | null,
  prompt: string,
  onStage: (stage: WorktreeStage) => void
) {
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  const root =
    project.parentId === null
      ? project
      : projects().find((item) => item.id === project.parentId)
  if (root === undefined) {
    throw new Error('That project was removed')
  }
  const worktree = await createWorktree(root.path, name, prompt, onStage)
  if (root.worktreeSetup !== null) {
    onStage('setup')
    try {
      await runSetup(worktree.cwd, root.worktreeSetup)
    } catch (error) {
      await removeWorktree(worktree)
      throw error
    }
  }
  const id = randomUUID()
  db.insert(projectsTable)
    .values({
      id,
      path: worktree.cwd,
      name: root.name,
      logo: root.logo,
      parentId: root.id,
    })
    .run()
  publish()
  return { ...worktree, id }
}

export async function removeWorktreeProject(
  project: Awaited<ReturnType<typeof addWorktreeProject>>
) {
  db.delete(projectsTable).where(eq(projectsTable.id, project.id)).run()
  publish()
  await removeWorktree(project)
}

export async function removeUnusedProject(project: Project) {
  if (project.scratch) {
    removeProject(project.id)
    return
  }
  const parent = projects().find((item) => item.id === project.parentId)
  if (parent === undefined) {
    throw new Error('That project was removed')
  }
  if (!(await removeCleanWorktree(parent.path, project.path))) {
    return
  }
  db.delete(projectsTable).where(eq(projectsTable.id, project.id)).run()
  publish()
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
  if (patch.scratch === false) {
    db.update(projectsTable)
      .set({ scratch: false, position: nextPosition() })
      .where(eq(projectsTable.id, id))
      .run()
  }
  if (patch.worktreeSetup !== undefined) {
    const command = patch.worktreeSetup.trim()
    db.update(projectsTable)
      .set({ worktreeSetup: command === '' ? null : command })
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
  db.delete(projectsTable)
    .where(or(eq(projectsTable.id, id), eq(projectsTable.parentId, id)))
    .run()
  publish()
}

export function reorderProjects(ids: string[]) {
  const current = projects()
    .filter((project) => !project.scratch && project.parentId === null)
    .map((project) => project.id)
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

function nextPosition() {
  const last = db
    .select({ position: max(projectsTable.position) })
    .from(projectsTable)
    .get()
  return last === undefined || last.position === null ? 0 : last.position + 1
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
