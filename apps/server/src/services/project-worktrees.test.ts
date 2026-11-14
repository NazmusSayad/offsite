import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const folders = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { join } = await import('node:path')
  const root = fs.realpathSync(
    fs.mkdtempSync(join(os.tmpdir(), 'offsite-worktrees-'))
  )
  return { root, home: join(root, 'home') }
})

vi.mock('../args.ts', () => ({
  args: { dir: folders.home },
  serverDir: path.join(import.meta.dirname, '..', '..'),
  version: 'test',
}))

const { db } = await import('../storage/db.ts')
const schema = await import('../storage/schema.ts')
const { addProject, removeProject } = await import('./projects.ts')
const worktrees = await import('./project-worktrees.ts')

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}
process.env = env

let repo: string

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
}

function branches() {
  return git(repo, 'branch', '--format=%(refname:short)').split('\n').sort()
}

async function addRepo(subfolder: string | null = null) {
  repo = mkdtempSync(path.join(folders.root, 'repo-'))
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(path.join(repo, 'README.md'), 'main\n')
  if (subfolder !== null) {
    mkdirSync(path.join(repo, subfolder))
    writeFileSync(path.join(repo, subfolder, 'app.txt'), 'app\n')
  }
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
  return addProject(subfolder === null ? repo : path.join(repo, subfolder))
}

async function newWorktree(projectId: string, name: string) {
  return worktrees.addProjectWorktree(
    projectId,
    { name, prompt: '', base: null },
    vi.fn()
  )
}

beforeEach(() => {
  db.delete(schema.projects).run()
})

afterAll(() => {
  rmSync(folders.root, { recursive: true, force: true })
})

describe('saving worktrees', () => {
  it('saves a new worktree under its project, not as a project', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'feature')

    expect(worktrees.worktrees()).toEqual([
      {
        id: created.id,
        projectId: project.id,
        path: created.cwd,
        branch: 'feature',
      },
    ])
    expect(db.select().from(schema.projects).all()).toHaveLength(1)
    expect(worktrees.places()).toEqual([
      [project.path, { projectId: project.id, worktreeId: null }],
      [created.cwd, { projectId: project.id, worktreeId: created.id }],
    ])
  })

  it('saves a worktree made outside offsite', async () => {
    const project = await addRepo()
    const folder = path.join(folders.root, `outside-${project.id}`)
    git(repo, 'worktree', 'add', '-q', '-b', 'outside', folder)

    const id = await worktrees.addExistingWorktree(project.id, folder)

    expect(worktrees.findWorktree(id)).toEqual({
      id,
      projectId: project.id,
      path: folder,
      branch: 'outside',
    })
  })

  it('refuses a folder that is not a worktree of the project', async () => {
    const project = await addRepo()
    const folder = mkdtempSync(path.join(folders.root, 'plain-'))

    await expect(
      worktrees.addExistingWorktree(project.id, folder)
    ).rejects.toThrow(`${folder} is not a worktree of ${project.name}`)
  })

  it('keeps the project subfolder inside the worktree', async () => {
    const project = await addRepo('app')
    const created = await newWorktree(project.id, 'nested')

    expect(created.cwd).toBe(path.join(created.folder, 'app'))
    expect(existsSync(path.join(created.cwd, 'app.txt'))).toBe(true)
  })

  it('lists the main folder and git worktrees with their saved ids', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'listed')
    const outside = path.join(folders.root, `unsaved-${project.id}`)
    git(repo, 'worktree', 'add', '-q', '-b', 'unsaved', outside)

    const choices = await worktrees.projectWorktrees(project.id)

    expect(
      choices.map((item) => ({
        worktreeId: item.worktreeId,
        branch: item.branch,
        worktree: item.worktree,
      }))
    ).toEqual(
      expect.arrayContaining([
        { worktreeId: null, branch: 'main', worktree: false },
        { worktreeId: created.id, branch: 'listed', worktree: true },
        { worktreeId: null, branch: 'unsaved', worktree: true },
      ])
    )
    expect(choices).toHaveLength(3)
  })
})

describe('finding the folder of a place', () => {
  it('uses the project folder without a worktree', async () => {
    const project = await addRepo()

    expect(worktrees.placePath(project.id, null)).toBe(project.path)
  })

  it('uses the worktree folder with a worktree', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'place')

    expect(worktrees.placePath(project.id, created.id)).toBe(created.cwd)
  })

  it('refuses a worktree of another project', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'mine')
    const other = await addRepo()

    expect(() => worktrees.placePath(other.id, created.id)).toThrow(
      `${created.cwd} is not a worktree of this project`
    )
  })

  it('refuses a removed worktree', async () => {
    const project = await addRepo()

    expect(() => worktrees.placePath(project.id, 'missing')).toThrow(
      'That worktree was removed'
    )
  })
})

describe('following a chat into a folder', () => {
  it('finds the project for its main folder', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'back')

    await expect(
      worktrees.placeAtFolder(created.cwd, project.path)
    ).resolves.toEqual({ projectId: project.id, worktreeId: null })
  })

  it('finds a saved worktree', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'saved')

    await expect(
      worktrees.placeAtFolder(project.path, created.cwd)
    ).resolves.toEqual({ projectId: project.id, worktreeId: created.id })
  })

  it('saves a worktree it has not seen', async () => {
    const project = await addRepo()
    const folder = path.join(folders.root, `claude-${project.id}`)
    git(repo, 'worktree', 'add', '-q', '-b', 'claude', folder)

    const place = await worktrees.placeAtFolder(project.path, folder)

    expect(place.projectId).toBe(project.id)
    expect(worktrees.findWorktree(place.worktreeId ?? '')).toEqual({
      id: place.worktreeId,
      projectId: project.id,
      path: folder,
      branch: 'claude',
    })
  })
})

describe('missing worktrees', () => {
  it('tells whether the folder or the branch is gone', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'state')

    await expect(worktrees.worktreeState(created.id)).resolves.toBe('ready')
    rmSync(created.cwd, { recursive: true })
    await expect(worktrees.worktreeState(created.id)).resolves.toBe(
      'folderMissing'
    )
    git(repo, 'worktree', 'prune')
    git(repo, 'branch', '-D', 'state')
    await expect(worktrees.worktreeState(created.id)).resolves.toBe(
      'branchMissing'
    )
  })

  it('restores a deleted folder from its branch', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'restore')
    writeFileSync(path.join(created.cwd, 'work.txt'), 'work\n')
    git(created.cwd, 'add', '.')
    git(created.cwd, 'commit', '-q', '-m', 'work')
    rmSync(created.cwd, { recursive: true })

    await expect(worktrees.restoreWorktreeFolder(created.id)).resolves.toEqual({
      warning: null,
    })
    expect(existsSync(path.join(created.cwd, 'work.txt'))).toBe(true)
    expect(git(created.cwd, 'branch', '--show-current')).toBe('restore')
  })

  it('restores a deleted folder and branch', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'gone')
    rmSync(created.cwd, { recursive: true })
    git(repo, 'worktree', 'prune')
    git(repo, 'branch', '-D', 'gone')

    await worktrees.restoreWorktreeFolder(created.id)

    expect(existsSync(path.join(created.cwd, 'README.md'))).toBe(true)
    expect(git(created.cwd, 'branch', '--show-current')).toBe('gone')
  })

  it('restores a deleted worktree of a project subfolder', async () => {
    const project = await addRepo('app')
    const created = await newWorktree(project.id, 'nested-restore')
    rmSync(path.dirname(created.cwd), { recursive: true })

    await worktrees.restoreWorktreeFolder(created.id)

    expect(existsSync(path.join(created.cwd, 'app.txt'))).toBe(true)
  })

  it('does nothing when the folder exists', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'present')

    await expect(worktrees.restoreWorktreeFolder(created.id)).resolves.toBe(
      null
    )
  })

  it('cannot restore a worktree without a known branch', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'unknown')
    db.update(schema.worktrees).set({ branch: null }).run()
    rmSync(created.cwd, { recursive: true })

    await expect(worktrees.restoreWorktreeFolder(created.id)).rejects.toThrow(
      'offsite does not know its branch'
    )
  })
})

describe('removing worktrees', () => {
  it('deletes the folder, the unused branch and the saved worktree', async () => {
    const project = await addRepo()
    const created = await newWorktree(project.id, 'remove')

    await worktrees.deleteSavedWorktree(created.id)

    expect(existsSync(created.cwd)).toBe(false)
    expect(branches()).toEqual(['main'])
    expect(worktrees.worktrees()).toEqual([])
  })

  it('removes the worktrees of a removed project', async () => {
    const project = await addRepo()
    await newWorktree(project.id, 'cascade')

    removeProject(project.id)

    expect(worktrees.worktrees()).toEqual([])
  })
})

describe('moving a chat to a new worktree', () => {
  it('takes the uncommitted changes along', async () => {
    const project = await addRepo()
    writeFileSync(path.join(repo, 'README.md'), 'changed\n')

    const moved = await worktrees.moveToNewWorktree(
      { projectId: project.id, worktreeId: null },
      'moved',
      'title'
    )

    expect(git(repo, 'status', '--porcelain')).toBe('')
    expect(git(moved.cwd, 'status', '--porcelain')).toBe('M README.md')
    expect(worktrees.findWorktree(moved.id)).toEqual({
      id: moved.id,
      projectId: project.id,
      path: moved.cwd,
      branch: 'moved',
    })
    expect(realpathSync(worktrees.placePath(project.id, moved.id))).toBe(
      realpathSync(moved.cwd)
    )
  })
})
