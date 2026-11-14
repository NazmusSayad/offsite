import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type {
  WorktreeChoice,
  WorktreeDetails,
  WorktreeStage,
  WorktreeState,
} from '@offsite/core/git'
import type { Worktree } from '@offsite/core/projects'
import { eq } from 'drizzle-orm'
import { broadcast } from '../lib/hub.ts'
import { db } from '../storage/db.ts'
import { worktrees as worktreesTable } from '../storage/schema.ts'
import { git } from './git.ts'
import { findProject, projectPath, projects } from './projects.ts'
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

export type Place = { projectId: string; worktreeId: string | null }

export function worktrees(): Worktree[] {
  return db.select().from(worktreesTable).all()
}

export function findWorktree(id: string) {
  const worktree = db
    .select()
    .from(worktreesTable)
    .where(eq(worktreesTable.id, id))
    .get()
  if (worktree === undefined) {
    throw new Error('That worktree was removed')
  }
  return worktree
}

export function placePath(projectId: string, worktreeId: string | null) {
  if (worktreeId === null) {
    return projectPath(projectId)
  }
  const worktree = findWorktree(worktreeId)
  if (worktree.projectId !== projectId) {
    throw new Error(`${worktree.path} is not a worktree of this project`)
  }
  return worktree.path
}

export function places() {
  return [
    ...projects().map((project): [string, Place] => [
      project.path,
      { projectId: project.id, worktreeId: null },
    ]),
    ...worktrees().map((worktree): [string, Place] => [
      worktree.path,
      { projectId: worktree.projectId, worktreeId: worktree.id },
    ]),
  ]
}

export async function addProjectWorktree(
  projectId: string,
  request: { name: string | null; prompt: string; base: string | null },
  onStage: (stage: WorktreeStage) => void
) {
  const worktree = await createWorktree(
    projectPath(projectId),
    request,
    onStage
  )
  const id = insertWorktree(projectId, worktree.cwd, worktree.branch)
  return { ...worktree, id }
}

export async function moveToNewWorktree(
  place: Place,
  name: string | null,
  title: string
) {
  if (findProject(place.projectId).scratch) {
    throw new Error('A chat without a project cannot move to a worktree')
  }
  const worktree = await moveIntoWorktree(
    placePath(place.projectId, place.worktreeId),
    name,
    title
  )
  return {
    ...worktree,
    id: insertWorktree(place.projectId, worktree.cwd, worktree.branch),
  }
}

export async function projectWorktrees(
  projectId: string
): Promise<WorktreeChoice[]> {
  const project = findProject(projectId)
  const listed = await listWorktrees(project.path)
  const saved = worktrees().filter((item) => item.projectId === projectId)
  const main = existsSync(project.path)
    ? worktreeOf(realpathSync(project.path), listed)
    : undefined
  return Promise.all(
    listed.map(async (item) => {
      const worktree = saved.find(
        (entry) =>
          existsSync(entry.path) &&
          worktreeOf(realpathSync(entry.path), listed) === item.folder
      )
      return {
        worktreeId: worktree === undefined ? null : worktree.id,
        folder: item.folder,
        branch: item.branch,
        worktree: item.folder !== main,
        activeAt: await lastActivity(item.folder),
      }
    })
  )
}

export async function projectBases(projectId: string, query: string) {
  const found = await Promise.all([
    worktreeBases(projectPath(projectId), query),
    projectWorktrees(projectId),
  ])
  return { ...found[0], worktrees: found[1] }
}

export async function addExistingWorktree(projectId: string, folder: string) {
  const project = findProject(projectId)
  const worktree = (await listWorktrees(project.path)).find(
    (item) => item.folder === folder
  )
  if (worktree === undefined) {
    throw new Error(`${folder} is not a worktree of ${project.name}`)
  }
  const prefix = (
    await git(project.path, ['rev-parse', '--show-prefix'])
  ).stdout.trim()
  const cwd = path.resolve(folder, prefix)
  if (!existsSync(cwd)) {
    throw new Error(`${cwd} does not exist in that worktree`)
  }
  return insertWorktree(projectId, cwd, worktree.branch)
}

export async function placeAtFolder(cwd: string, folder: string) {
  const owner = places().find((entry) => entry[0] === cwd)
  if (owner === undefined) {
    throw new Error(`${cwd} is not a project`)
  }
  const real = realpathSync(folder)
  const existing = places().find(
    (entry) => existsSync(entry[0]) && realpathSync(entry[0]) === real
  )
  if (existing !== undefined) {
    return existing[1]
  }
  const project = findProject(owner[1].projectId)
  const worktree = (await listWorktrees(project.path)).find(
    (item) => realpathSync(item.folder) === real
  )
  if (worktree === undefined) {
    throw new Error(`${folder} is not a worktree of ${project.name}`)
  }
  return {
    projectId: project.id,
    worktreeId: insertWorktree(project.id, folder, worktree.branch),
  }
}

export async function savedWorktreeDetails(
  worktreeId: string
): Promise<WorktreeDetails> {
  const worktree = findWorktree(worktreeId)
  return worktreeDetails(await worktreeFolder(worktree), worktree.branch)
}

export async function deleteSavedWorktree(worktreeId: string) {
  const worktree = findWorktree(worktreeId)
  await deleteWorktree(
    projectPath(worktree.projectId),
    await worktreeFolder(worktree),
    worktree.branch
  )
  db.delete(worktreesTable).where(eq(worktreesTable.id, worktree.id)).run()
  publishWorktrees()
}

export async function restoreWorktreeFolder(worktreeId: string) {
  const worktree = findWorktree(worktreeId)
  if (existsSync(worktree.path)) {
    return null
  }
  if (worktree.branch === null) {
    throw new Error(
      `The worktree folder ${worktree.path} is gone and offsite does not know its branch`
    )
  }
  const warning = await restoreWorktree(
    projectPath(worktree.projectId),
    await worktreeFolder(worktree),
    worktree.branch
  )
  if (!existsSync(worktree.path)) {
    throw new Error(
      `${worktree.path} does not exist on the branch ${worktree.branch}`
    )
  }
  return { warning }
}

export async function worktreeState(
  worktreeId: string
): Promise<WorktreeState> {
  const worktree = findWorktree(worktreeId)
  if (existsSync(worktree.path)) {
    return 'ready'
  }
  if (
    worktree.branch !== null &&
    (await branchExists(projectPath(worktree.projectId), worktree.branch))
  ) {
    return 'folderMissing'
  }
  return 'branchMissing'
}

export function publishWorktrees() {
  broadcast({ type: 'worktrees', worktrees: worktrees() })
}

function insertWorktree(projectId: string, cwd: string, branch: string | null) {
  const id = randomUUID()
  db.insert(worktreesTable).values({ id, projectId, path: cwd, branch }).run()
  publishWorktrees()
  return id
}

async function worktreeFolder(worktree: Worktree) {
  if (existsSync(worktree.path)) {
    return (
      await git(worktree.path, ['rev-parse', '--show-toplevel'])
    ).stdout.trim()
  }
  const prefix = (
    await git(projectPath(worktree.projectId), ['rev-parse', '--show-prefix'])
  ).stdout
    .trim()
    .replace(/\/$/, '')
  if (prefix === '') {
    return worktree.path
  }
  if (!worktree.path.endsWith(`${path.sep}${prefix}`)) {
    throw new Error(`Could not find the worktree folder of ${worktree.path}`)
  }
  return worktree.path.slice(0, -prefix.length - 1)
}

function worktreeOf(folder: string, listed: { folder: string }[]) {
  return listed
    .filter(
      (item) =>
        folder === item.folder || folder.startsWith(`${item.folder}${path.sep}`)
    )
    .sort((a, b) => b.folder.length - a.folder.length)
    .at(0)?.folder
}
