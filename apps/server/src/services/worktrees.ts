import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { WorktreeDetails, WorktreeStage } from '@offsite/core/git'
import { keyedLock } from '../lib/locks.ts'
import { home } from '../storage/storage.ts'
import { chosenName, generatedName, type Named } from './branch-names.ts'
import { git, gitError, listBranches } from './git.ts'

const FETCH_TIMEOUT = 60_000
const LOCAL_LIMIT = 10
const REMOTE_LIMIT = 5
const SEARCH_LIMIT = 20
const worktreeRoot = path.join(home, 'worktrees')
const run = promisify(execFile)
const locked = keyedLock()

export async function createWorktree(
  repo: string,
  request: { name: string | null; prompt: string; base: string | null },
  onStage: (stage: WorktreeStage) => void
) {
  const top = await repoTop(repo)
  const prefix = (await git(repo, ['rev-parse', '--show-prefix'])).stdout.trim()
  return locked(top, async () => {
    onStage('fetch')
    const prepared = await Promise.all([
      (async () => {
        const start = await startPoint(top, request.base)
        if (request.name === null) {
          onStage('name')
        }
        return start
      })(),
      request.name === null
        ? generatedName(top, request.prompt)
        : chosenName(top, request.name),
    ])
    const start = prepared[0]
    const named = prepared[1]
    const target = await targetFor(top, named)
    onStage('create')
    await addWorktree(top, target, start.ref)
    const warnings = [start.warning, named.warning].filter(
      (item) => item !== null
    )
    return {
      ...target,
      cwd: path.join(target.folder, prefix),
      warning: warnings.length === 0 ? null : warnings.join('\n'),
    }
  })
}

export async function moveIntoWorktree(
  repo: string,
  name: string | null,
  title: string
) {
  const top = await repoTop(repo)
  const prefix = (await git(repo, ['rev-parse', '--show-prefix'])).stdout.trim()
  const named = await (name === null
    ? generatedName(top, title)
    : chosenName(top, name))
  return locked(top, async () => {
    const start = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim()
    const target = await targetFor(top, named)
    await addWorktree(top, target, start)
    const changed = (await git(repo, ['status', '--porcelain'])).stdout !== ''
    if (changed) {
      const label = `offsite: move to ${target.branch}`
      try {
        await git(repo, ['stash', 'push', '--include-untracked', '-m', label])
      } catch (error) {
        await removeWorktree({ repo: top, ...target })
        throw new Error(
          `Could not take the uncommitted changes: ${gitError(error).message}`,
          { cause: error }
        )
      }
      try {
        await git(target.folder, ['stash', 'pop', '--index'])
      } catch (error) {
        throw new Error(
          `The worktree ${target.folder} was created, but the uncommitted changes could not be applied there. They are kept in the stash "${label}": ${gitError(error).message}`,
          { cause: error }
        )
      }
    }
    return {
      ...target,
      cwd: path.join(target.folder, prefix),
      warning: named.warning,
    }
  })
}

export async function localBranches(repo: string) {
  const branches = (await listBranches(repo, false)).map((name) => ({
    name,
    local: true,
  }))
  const base = await knownDefaultBase(repo)
  if (base === null) {
    return branches
  }
  const name = defaultBranchName(base)
  return [
    { name, local: branches.some((branch) => branch.name === name) },
    ...branches.filter((branch) => branch.name !== name),
  ]
}

function defaultBranchName(ref: string) {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/origin/')) {
    return ref.slice('refs/remotes/origin/'.length)
  }
  throw new Error(`${ref} is not a branch`)
}

export async function uncommittedFiles(repo: string) {
  return (await git(repo, ['status', '--porcelain'])).stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.slice(3))
}

export async function restoreWorktree(
  repo: string,
  folder: string,
  branch: string
) {
  const top = await repoTop(repo)
  await locked(top, async () => {
    if (!(await refExists(top, `refs/heads/${branch}`))) {
      throw new Error(
        `The worktree folder ${folder} is gone and its branch ${branch} no longer exists`
      )
    }
    await git(top, ['worktree', 'prune'])
    try {
      await git(top, ['worktree', 'add', folder, branch])
    } catch (error) {
      throw new Error(
        `Could not recreate the worktree folder ${folder}: ${gitError(error).message}`,
        { cause: error }
      )
    }
  })
}

async function removeWorktree(worktree: {
  repo: string
  folder: string
  branch: string
}) {
  await git(worktree.repo, ['worktree', 'remove', '--force', worktree.folder])
  await git(worktree.repo, ['branch', '-D', worktree.branch])
}

export async function deleteWorktree(
  repo: string,
  folder: string,
  savedBranch: string | null
) {
  const top = await repoTop(repo)
  await locked(top, async () => {
    if (!existsSync(folder)) {
      await git(top, ['worktree', 'prune'])
      if (
        savedBranch !== null &&
        (await refExists(top, `refs/heads/${savedBranch}`)) &&
        (await ownCommits(top, `refs/heads/${savedBranch}`, savedBranch)) === 0
      ) {
        await git(top, ['branch', '-D', savedBranch])
      }
      return
    }
    const branch = await currentBranch(folder)
    const commits = await ownCommits(folder, 'HEAD', branch)
    try {
      await git(top, ['worktree', 'remove', '--force', folder])
    } catch (error) {
      throw gitError(error)
    }
    if (branch !== null && commits === 0) {
      await git(top, ['branch', '-D', branch])
    }
  })
}

export async function worktreeDetails(
  folder: string,
  savedBranch: string | null
): Promise<WorktreeDetails> {
  if (!existsSync(folder)) {
    return { folder, branch: savedBranch, changes: 0, commits: 0, ignored: [] }
  }
  const branch = await currentBranch(folder)
  const lines = (
    await git(folder, ['status', '--porcelain', '--ignored'])
  ).stdout
    .split('\n')
    .filter((line) => line !== '')
  return {
    folder,
    branch,
    changes: lines.filter((line) => !line.startsWith('!! ')).length,
    commits: await ownCommits(folder, 'HEAD', branch),
    ignored: lines
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3)),
  }
}

export async function worktreeBases(repo: string, query: string) {
  const top = await repoTop(repo)
  const defaultBase = await defaultBaseOf(top)
  const local = (await branchRefs(top, 'refs/heads')).filter(
    (item) => item.ref !== defaultBase
  )
  const remote = (await branchRefs(top, 'refs/remotes')).filter(
    (item) => item.ref !== defaultBase
  )
  const needle = query.trim().toLowerCase()
  if (needle !== '') {
    return {
      defaultBase,
      local: local
        .filter((item) => shortRef(item.ref).toLowerCase().includes(needle))
        .slice(0, SEARCH_LIMIT)
        .map((item) => item.ref),
      remote: remote
        .filter((item) => shortRef(item.ref).toLowerCase().includes(needle))
        .slice(0, SEARCH_LIMIT)
        .map((item) => item.ref),
    }
  }
  const email = await userEmail(top)
  return {
    defaultBase,
    local: local.slice(0, LOCAL_LIMIT).map((item) => item.ref),
    remote:
      email === null
        ? []
        : remote
            .filter((item) => item.email === email)
            .slice(0, REMOTE_LIMIT)
            .map((item) => item.ref),
  }
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

async function repoTop(repo: string) {
  try {
    return (await listWorktrees(repo))[0].folder
  } catch (error) {
    throw new Error(`${repo} is not a Git repository`, { cause: error })
  }
}

async function startPoint(top: string, base: string | null) {
  const ref = base ?? (await defaultBaseOf(top))
  if (ref.startsWith('refs/heads/')) {
    if (!(await refExists(top, ref))) {
      throw new Error(`The branch ${shortRef(ref)} no longer exists`)
    }
    return { ref, warning: null }
  }
  if (ref.startsWith('refs/remotes/')) {
    return { ref, warning: await fetchRemoteBranch(top, ref) }
  }
  throw new Error(`${ref} is not a branch`)
}

async function fetchRemoteBranch(top: string, ref: string) {
  const remote = (await remoteNames(top))
    .filter((name) => ref.startsWith(`refs/remotes/${name}/`))
    .sort((a, b) => b.length - a.length)
    .at(0)
  if (remote === undefined) {
    throw new Error(`No remote has the branch ${shortRef(ref)}`)
  }
  const branch = ref.slice(`refs/remotes/${remote}/`.length)
  try {
    await run(
      'git',
      ['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${branch}:${ref}`],
      {
        cwd: top,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: FETCH_TIMEOUT,
      }
    )
    return null
  } catch (error) {
    const reason = gitError(error).message
    if (!(await refExists(top, ref))) {
      throw new Error(`Could not fetch ${shortRef(ref)}: ${reason}`, {
        cause: error,
      })
    }
    return `Could not fetch ${shortRef(ref)}, so the worktree starts from the copy fetched before: ${reason}`
  }
}

async function defaultBaseOf(top: string) {
  const base = await knownDefaultBase(top)
  if (base !== null) {
    return base
  }
  const current = await currentBranch(top)
  if (current === null) {
    throw new Error('Could not find a main or master branch')
  }
  return `refs/heads/${current}`
}

async function knownDefaultBase(top: string) {
  if ((await remoteNames(top)).includes('origin')) {
    if (await refExists(top, 'refs/remotes/origin/HEAD')) {
      return (
        await git(top, ['symbolic-ref', 'refs/remotes/origin/HEAD'])
      ).stdout.trim()
    }
    for (const branch of ['main', 'master']) {
      if (await refExists(top, `refs/remotes/origin/${branch}`)) {
        return `refs/remotes/origin/${branch}`
      }
    }
  }
  for (const branch of ['main', 'master']) {
    if (await refExists(top, `refs/heads/${branch}`)) {
      return `refs/heads/${branch}`
    }
  }
  return null
}

async function branchRefs(top: string, namespace: string) {
  return (
    await git(top, [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname)%00%(symref)%00%(authoremail)',
      namespace,
    ])
  ).stdout
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\0'))
    .filter((fields) => fields[1] === '')
    .map((fields) => ({
      ref: fields[0],
      email: fields[2].replace(/^<|>$/g, '').toLowerCase(),
    }))
}

async function userEmail(top: string) {
  try {
    const email = (await git(top, ['config', 'user.email'])).stdout.trim()
    return email === '' ? null : email.toLowerCase()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1) {
      return null
    }
    throw error
  }
}

async function remoteNames(top: string) {
  return (await git(top, ['remote'])).stdout
    .split('\n')
    .filter((name) => name !== '')
}

async function currentBranch(folder: string) {
  try {
    return (
      await git(folder, ['symbolic-ref', '--short', '-q', 'HEAD'])
    ).stdout.trim()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 1) {
      return null
    }
    throw error
  }
}

async function ownCommits(cwd: string, tip: string, branch: string | null) {
  const output = await git(cwd, [
    'rev-list',
    '--count',
    tip,
    '--not',
    ...(branch === null ? [] : [`--exclude=${branch}`]),
    '--branches',
    '--remotes',
  ])
  return Number(output.stdout.trim())
}

async function targetFor(top: string, named: Named) {
  const parent = path.join(worktreeRoot, path.basename(top))
  if (!named.generated) {
    if (await refExists(top, `refs/heads/${named.branch}`)) {
      throw new Error(`The branch ${named.branch} already exists`)
    }
    const folder = path.join(parent, named.branch.replaceAll('/', '-'))
    if (existsSync(folder)) {
      throw new Error(`${folder} already exists`)
    }
    return { branch: named.branch, folder }
  }
  for (let number = 1; ; number++) {
    const branch = number === 1 ? named.branch : `${named.branch}-${number}`
    const folder = path.join(parent, branch.replaceAll('/', '-'))
    if (
      !existsSync(folder) &&
      !(await refExists(top, `refs/heads/${branch}`))
    ) {
      return { branch, folder }
    }
  }
}

async function addWorktree(
  top: string,
  target: { branch: string; folder: string },
  start: string
) {
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
}

function shortRef(ref: string) {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/')) {
    return ref.slice('refs/remotes/'.length)
  }
  return ref
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
