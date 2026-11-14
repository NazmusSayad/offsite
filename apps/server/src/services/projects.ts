import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readdir, rmdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  WorktreeChoice,
  WorktreeDetails,
  WorktreeStage,
  WorktreeState,
} from '@offsite/core/git'
import type {
  DirectoryListing,
  Project,
  ProjectPatch,
} from '@offsite/core/projects'
import { eq, max, or } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { projectScores } from '../storage/interactions.ts'
import { projects as projectsTable } from '../storage/schema.ts'
import { home, scratchAvailable } from '../storage/storage.ts'
import { git } from './git.ts'
import { findLogo, prepareLogo } from './logos.ts'
import {
  branchExists,
  createWorktree,
  deleteWorktree,
  lastActivity,
  listWorktrees,
  moveIntoWorktree,
  restoreWorktree,
  worktreeBases,
  worktreeDetails,
} from './worktrees.ts'

const scratchRoot = path.join(home, 'scratch')

export function projects(): Project[] {
  const scores = projectScores()
  return db
    .select({
      id: projectsTable.id,
      path: projectsTable.path,
      name: projectsTable.name,
      logo: projectsTable.logo,
      pinned: projectsTable.pinned,
      hidden: projectsTable.hidden,
      scratch: projectsTable.scratch,
      parentId: projectsTable.parentId,
      worktreeSetup: projectsTable.worktreeSetup,
      worktreeBranch: projectsTable.worktreeBranch,
    })
    .from(projectsTable)
    .orderBy(projectsTable.position)
    .all()
    .map((project) => ({ ...project, score: scores.get(project.id) ?? 0 }))
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
  publishProjects()
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
    publishProjects()
    return { id, path: folder }
  }
}

export async function removeScratchProject(id: string, folder: string) {
  db.delete(projectsTable).where(eq(projectsTable.id, id)).run()
  publishProjects()
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
  request: { name: string | null; prompt: string; base: string | null },
  onStage: (stage: WorktreeStage) => void
) {
  const root = rootProject(projectId)
  const worktree = await createWorktree(root.path, request, onStage)
  const id = insertWorktree(root, worktree.cwd, worktree.branch)
  return { ...worktree, id }
}

export async function moveProjectToWorktree(
  projectId: string,
  name: string | null,
  title: string
) {
  const project = gitProject(projectId)
  const root = rootProject(projectId)
  const worktree = await moveIntoWorktree(project.path, name, title)
  return {
    ...worktree,
    id: insertWorktree(root, worktree.cwd, worktree.branch),
  }
}

export async function projectWorktrees(
  projectId: string
): Promise<WorktreeChoice[]> {
  const root = rootProject(projectId)
  const worktrees = await listWorktrees(root.path)
  const members = [
    root,
    ...projects().filter((item) => item.parentId === root.id),
  ]
  return Promise.all(
    worktrees.map(async (worktree) => {
      const project = members.find(
        (item) =>
          existsSync(item.path) &&
          worktreeOf(realpathSync(item.path), worktrees) === worktree.folder
      )
      return {
        projectId: project === undefined ? null : project.id,
        folder: worktree.folder,
        branch: worktree.branch,
        worktree: project === undefined || project.id !== root.id,
        activeAt: await lastActivity(worktree.folder),
      }
    })
  )
}

export async function projectBases(projectId: string, query: string) {
  const found = await Promise.all([
    worktreeBases(rootProject(projectId).path, query),
    projectWorktrees(projectId),
  ])
  return { ...found[0], worktrees: found[1] }
}

export async function addExistingWorktree(projectId: string, folder: string) {
  const root = rootProject(projectId)
  const worktree = (await listWorktrees(root.path)).find(
    (item) => item.folder === folder
  )
  if (worktree === undefined) {
    throw new Error(`${folder} is not a worktree of ${root.name}`)
  }
  const prefix = (
    await git(root.path, ['rev-parse', '--show-prefix'])
  ).stdout.trim()
  const cwd = path.join(folder, prefix)
  if (!existsSync(cwd)) {
    throw new Error(`${cwd} does not exist in that worktree`)
  }
  return insertWorktree(root, cwd, worktree.branch)
}

export async function projectAtFolder(projectId: string, folder: string) {
  const real = realpathSync(folder)
  const existing = projects().find(
    (item) => existsSync(item.path) && realpathSync(item.path) === real
  )
  if (existing !== undefined) {
    return existing.id
  }
  const root = rootProject(projectId)
  const worktree = (await listWorktrees(root.path)).find(
    (item) => realpathSync(item.folder) === real
  )
  if (worktree === undefined) {
    throw new Error(`${folder} is not a worktree of ${root.name}`)
  }
  return insertWorktree(root, folder, worktree.branch)
}

export async function worktreeProjectDetails(
  projectId: string
): Promise<WorktreeDetails> {
  const project = worktreeProject(projectId)
  return worktreeDetails(await worktreeFolder(project), project.worktreeBranch)
}

export async function deleteWorktreeProject(projectId: string) {
  const project = worktreeProject(projectId)
  const root = rootProject(projectId)
  await deleteWorktree(
    root.path,
    await worktreeFolder(project),
    project.worktreeBranch
  )
  db.delete(projectsTable).where(eq(projectsTable.id, project.id)).run()
  publishProjects()
}

export async function restoreWorktreeFolder(projectId: string) {
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  if (existsSync(project.path) || project.parentId === null) {
    return null
  }
  if (project.worktreeBranch === null) {
    throw new Error(
      `The worktree folder ${project.path} is gone and offsite does not know its branch`
    )
  }
  const root = rootProject(projectId)
  const warning = await restoreWorktree(
    root.path,
    await worktreeFolder(project),
    project.worktreeBranch
  )
  if (!existsSync(project.path)) {
    throw new Error(
      `${project.path} does not exist on the branch ${project.worktreeBranch}`
    )
  }
  return { warning }
}

export async function worktreeState(projectId: string): Promise<WorktreeState> {
  const project = worktreeProject(projectId)
  if (existsSync(project.path)) {
    return 'ready'
  }
  if (
    project.worktreeBranch !== null &&
    (await branchExists(rootProject(projectId).path, project.worktreeBranch))
  ) {
    return 'folderMissing'
  }
  return 'branchMissing'
}

export function rootProject(projectId: string) {
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
  return root
}

function insertWorktree(root: Project, cwd: string, branch: string | null) {
  const id = randomUUID()
  db.insert(projectsTable)
    .values({
      id,
      path: cwd,
      name: root.name,
      logo: root.logo,
      parentId: root.id,
      worktreeBranch: branch,
    })
    .run()
  publishProjects()
  return id
}

function gitProject(projectId: string) {
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  if (project.scratch) {
    throw new Error('A chat without a project cannot move to a worktree')
  }
  return project
}

function worktreeProject(projectId: string) {
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined) {
    throw new Error('That project was removed')
  }
  if (project.parentId === null || project.scratch) {
    throw new Error(`${project.path} is not a worktree`)
  }
  return project
}

async function worktreeFolder(project: Project) {
  if (existsSync(project.path)) {
    return (
      await git(project.path, ['rev-parse', '--show-toplevel'])
    ).stdout.trim()
  }
  const root = rootProject(project.id)
  const prefix = (await git(root.path, ['rev-parse', '--show-prefix'])).stdout
    .trim()
    .replace(/\/$/, '')
  if (prefix === '') {
    return project.path
  }
  if (!project.path.endsWith(`${path.sep}${prefix}`)) {
    throw new Error(`Could not find the worktree folder of ${project.path}`)
  }
  return project.path.slice(0, -prefix.length - 1)
}

function worktreeOf(folder: string, worktrees: { folder: string }[]) {
  return worktrees
    .filter(
      (item) =>
        folder === item.folder || folder.startsWith(`${item.folder}${path.sep}`)
    )
    .sort((a, b) => b.folder.length - a.folder.length)
    .at(0)?.folder
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
  if (patch.pinned !== undefined) {
    db.update(projectsTable)
      .set({ pinned: patch.pinned })
      .where(eq(projectsTable.id, id))
      .run()
  }
  if (patch.hidden !== undefined) {
    db.update(projectsTable)
      .set({ hidden: patch.hidden })
      .where(eq(projectsTable.id, id))
      .run()
  }
  publishProjects()
  return null
}

export function removeProject(id: string) {
  db.delete(projectsTable)
    .where(or(eq(projectsTable.id, id), eq(projectsTable.parentId, id)))
    .run()
  publishProjects()
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

export function publishProjects() {
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
