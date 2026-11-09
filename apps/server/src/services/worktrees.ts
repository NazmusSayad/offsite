import { exec, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { WorktreeStage } from '@offsite/core/git'
import { home } from '../storage/storage.ts'
import { git, gitError } from './git.ts'

const FETCH_TIMEOUT = 60_000
const SETUP_TIMEOUT = 4 * 60_000
const SETUP_OUTPUT_LINES = 20
const BRANCH_PREFIX = 'offsite/'
const worktreeRoot = path.join(home, 'worktrees')
const run = promisify(execFile)
const shell = promisify(exec)

export async function createWorktree(
  repo: string,
  name: string | null,
  prompt: string,
  onStage: (stage: WorktreeStage) => void
) {
  let top
  try {
    top = (await git(repo, ['rev-parse', '--show-toplevel'])).stdout.trim()
  } catch (error) {
    throw new Error(`${repo} is not a Git repository`, { cause: error })
  }
  const prefix = (await git(repo, ['rev-parse', '--show-prefix'])).stdout.trim()
  onStage('pull')
  const start = await freshMain(top)
  const parent = path.join(worktreeRoot, path.basename(top))
  const target =
    name === null
      ? await generatedTarget(top, parent, prompt)
      : await chosenTarget(top, parent, name)
  onStage('create')
  try {
    await git(top, [
      'worktree',
      'add',
      '--no-track',
      '-b',
      target.branch,
      target.folder,
      start,
    ])
  } catch (error) {
    throw gitError(error)
  }
  return { ...target, repo: top, cwd: path.join(target.folder, prefix) }
}

export async function runSetup(cwd: string, command: string) {
  try {
    await shell(command, {
      cwd,
      timeout: SETUP_TIMEOUT,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    const output =
      error instanceof Error && 'stderr' in error && 'stdout' in error
        ? `${String(error.stdout)}${String(error.stderr)}`
        : String(error)
    throw new Error(
      `The worktree setup command failed:\n${output.trim().split('\n').slice(-SETUP_OUTPUT_LINES).join('\n')}`,
      { cause: error }
    )
  }
}

export async function removeCleanWorktree(repo: string, cwd: string) {
  if (!existsSync(cwd)) {
    await git(repo, ['worktree', 'prune'])
    return true
  }
  if ((await git(cwd, ['status', '--porcelain'])).stdout !== '') {
    return false
  }
  const folder = (
    await git(cwd, ['rev-parse', '--show-toplevel'])
  ).stdout.trim()
  await git(repo, ['worktree', 'remove', '--force', folder])
  return true
}

export async function removeWorktree(worktree: {
  repo: string
  folder: string
  branch: string
}) {
  await git(worktree.repo, ['worktree', 'remove', '--force', worktree.folder])
  await git(worktree.repo, ['branch', '-D', worktree.branch])
}

async function freshMain(repo: string) {
  const remotes = (await git(repo, ['remote'])).stdout.split('\n')
  if (!remotes.includes('origin')) {
    return mainBranch(repo, 'refs/heads/')
  }
  const branch = await mainBranch(repo, 'refs/remotes/origin/')
  try {
    await run(
      'git',
      [
        'fetch',
        '--quiet',
        '--no-tags',
        'origin',
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ],
      {
        cwd: repo,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: FETCH_TIMEOUT,
      }
    )
  } catch (error) {
    throw gitError(error)
  }
  const local = `refs/heads/${branch}`
  const remote = `refs/remotes/origin/${branch}`
  if (!(await refExists(repo, local))) {
    return remote
  }
  const checkout = await checkoutOf(repo, branch)
  try {
    if (checkout !== null) {
      await git(checkout, ['merge', '--ff-only', remote])
    } else if (
      !(await gitTest(repo, ['merge-base', '--is-ancestor', remote, local]))
    ) {
      await git(repo, ['fetch', '.', `${remote}:${local}`])
    }
  } catch (error) {
    throw new Error(`Could not pull ${branch}: ${gitError(error).message}`, {
      cause: error,
    })
  }
  return branch
}

export async function listWorktrees(repo: string) {
  const output = await git(repo, ['worktree', 'list', '--porcelain'])
  return output.stdout
    .trim()
    .split('\n\n')
    .map((block) => block.split('\n'))
    .filter((lines) => !lines.some((line) => line.startsWith('prunable')))
    .map((lines) => {
      if (!lines[0].startsWith('worktree ')) {
        throw new Error('Could not read the Git worktrees')
      }
      const branch = lines.find((line) => line.startsWith('branch refs/heads/'))
      return {
        folder: path.resolve(lines[0].slice('worktree '.length)),
        branch:
          branch === undefined
            ? null
            : branch.slice('branch refs/heads/'.length),
      }
    })
}

async function checkoutOf(repo: string, branch: string) {
  const worktree = (await listWorktrees(repo)).find(
    (item) => item.branch === branch
  )
  return worktree === undefined ? null : worktree.folder
}

async function mainBranch(repo: string, refs: string) {
  if (
    refs === 'refs/remotes/origin/' &&
    (await refExists(repo, 'refs/remotes/origin/HEAD'))
  ) {
    const head = await git(repo, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ])
    return head.stdout.trim().slice('origin/'.length)
  }
  for (const branch of ['main', 'master']) {
    if (await refExists(repo, `${refs}${branch}`)) {
      return branch
    }
  }
  throw new Error('Could not find a main or master branch')
}

async function generatedTarget(repo: string, parent: string, prompt: string) {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-')
    .slice(0, 40)
    .replace(/-+$/, '')
  const base = `${BRANCH_PREFIX}${words === '' ? 'worktree' : words}`
  for (let number = 1; ; number++) {
    const branch = number === 1 ? base : `${base}-${number}`
    const folder = path.join(parent, branch.replaceAll('/', '-'))
    if (
      !existsSync(folder) &&
      !(await refExists(repo, `refs/heads/${branch}`))
    ) {
      return { branch, folder }
    }
  }
}

async function chosenTarget(repo: string, parent: string, name: string) {
  let branch
  try {
    branch = (
      await git(repo, ['check-ref-format', '--branch', name])
    ).stdout.trim()
  } catch (error) {
    throw new Error(`${name} is not a valid branch name`, { cause: error })
  }
  if (await refExists(repo, `refs/heads/${branch}`)) {
    throw new Error(`The branch ${branch} already exists`)
  }
  const folder = path.join(parent, branch.replaceAll('/', '-'))
  if (existsSync(folder)) {
    throw new Error(`${folder} already exists`)
  }
  return { branch, folder }
}

function refExists(repo: string, ref: string) {
  return gitTest(repo, ['show-ref', '--verify', '--quiet', ref])
}

async function gitTest(repo: string, args: string[]) {
  try {
    await git(repo, args)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1) {
      return false
    }
    throw error
  }
}
