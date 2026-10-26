import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  GitAction,
  GitCommit,
  GitResource,
  GitStatus,
  SourceControlRepo,
} from '@offsite/core/git'
import { diffBase, git, gitError, projectRepos } from './git.ts'

const SHOW_LIMIT = 1024 * 1024
const NETWORK_TIMEOUT = 120_000
const run = promisify(execFile)

export async function sourceControl(cwd: string) {
  return Promise.all(
    (await projectRepos(cwd)).map(async (repo) => ({
      ...(await repoChanges(path.join(cwd, repo))),
      path: repo,
    }))
  )
}

export async function showFile(cwd: string, ref: string, file: string) {
  const output = await git(cwd, ['cat-file', 'blob', `${ref}:${file}`])
  if (output.stdout.length > SHOW_LIMIT || output.stdout.includes('\0')) {
    return null
  }
  return output.stdout
}

export async function history(cwd: string, limit: number) {
  const upstream = (
    await git(cwd, [
      'branch',
      '--format=%(if)%(HEAD)%(then)%(if:notequals=[gone])%(upstream:track)%(then)%(upstream)%(end)%(end)',
    ])
  ).stdout.trim()
  const output = await git(cwd, [
    'log',
    '--topo-order',
    `--max-count=${limit}`,
    '--format=%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s%x1e',
    'HEAD',
    ...(upstream === '' ? [] : [upstream]),
    '--',
  ])
  return output.stdout
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record): GitCommit => {
      const fields = record.split('\x1f')
      return {
        hash: fields[0],
        parents: fields[1].split(' ').filter(Boolean),
        author: fields[2],
        date: Number(fields[3]) * 1000,
        refs: fields[4].split(', ').filter(Boolean),
        subject: fields[5],
      }
    })
}

export async function commitFiles(
  cwd: string,
  hash: string,
  parent: string | null
) {
  const base =
    parent ??
    (await git(cwd, ['hash-object', '-t', 'tree', '/dev/null'])).stdout.trim()
  const output = await git(cwd, [
    'diff',
    '--name-status',
    '-M',
    '-z',
    base,
    hash,
  ])
  const tokens = output.stdout.split('\0')
  const files: GitResource[] = []
  for (let index = 0; index < tokens.length - 1; index++) {
    const status = letter(tokens[index][0])
    if (status === 'R' || status === 'C') {
      files.push({ path: tokens[index + 2], from: tokens[index + 1], status })
      index += 2
      continue
    }
    files.push({ path: tokens[index + 1], from: null, status })
    index += 1
  }
  return files
}

export async function undoCommit(cwd: string) {
  const message = (await git(cwd, ['log', '-1', '--format=%B'])).stdout.trim()
  const parents = (
    await git(cwd, ['rev-list', '--parents', '--max-count=1', 'HEAD'])
  ).stdout
    .trim()
    .split(' ')
  if (parents.length === 1) {
    await git(cwd, ['update-ref', '-d', 'HEAD'])
  } else {
    await git(cwd, ['reset', '--soft', 'HEAD~1'])
  }
  return message
}

export async function runAction(cwd: string, action: GitAction) {
  if (action.kind === 'stage') {
    await git(cwd, ['--literal-pathspecs', 'add', '-A', '--', ...action.paths])
    return
  }
  if (action.kind === 'unstage') {
    await git(cwd, [
      '--literal-pathspecs',
      'reset',
      '-q',
      await diffBase(cwd),
      '--',
      ...action.paths,
    ])
    return
  }
  if (action.kind === 'discard') {
    if (action.tracked.length > 0) {
      await git(cwd, [
        '--literal-pathspecs',
        'checkout',
        '-q',
        '--',
        ...action.tracked,
      ])
    }
    if (action.untracked.length > 0) {
      await git(cwd, [
        '--literal-pathspecs',
        'clean',
        '-f',
        '-q',
        '--',
        ...action.untracked,
      ])
    }
    return
  }
  if (action.kind === 'ignore') {
    const file = path.join(cwd, '.gitignore')
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    appendFileSync(
      file,
      `${current === '' || current.endsWith('\n') ? '' : '\n'}${action.paths.join('\n')}\n`
    )
    return
  }
  if (action.kind === 'commit') {
    if (action.all) {
      await git(cwd, ['add', '--all'])
    }
    await git(cwd, [
      'commit',
      ...(action.amend ? ['--amend'] : []),
      ...(action.message === ''
        ? ['--no-edit']
        : ['--message', action.message]),
    ])
    return
  }
  if (action.kind === 'pull') {
    await network(cwd, action.rebase ? ['pull', '--rebase'] : ['pull'])
    return
  }
  if (action.kind === 'fetch') {
    await network(cwd, [
      'fetch',
      ...(action.prune ? ['--prune'] : []),
      ...(action.all ? ['--all'] : []),
    ])
    return
  }
  if (action.kind === 'stash') {
    if (action.mode === 'tracked') {
      await git(cwd, ['stash', 'push'])
    }
    if (action.mode === 'untracked') {
      await git(cwd, ['stash', 'push', '--include-untracked'])
    }
    if (action.mode === 'staged') {
      await git(cwd, ['stash', 'push', '--staged'])
    }
    return
  }
  if (action.kind === 'unstash') {
    await git(cwd, ['stash', action.pop ? 'pop' : 'apply'])
    return
  }
  throw new Error('Unknown git action')
}

async function network(cwd: string, args: string[]) {
  try {
    await run('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: NETWORK_TIMEOUT,
    })
  } catch (error) {
    throw gitError(error)
  }
}

async function repoChanges(cwd: string) {
  const output = await git(cwd, [
    '--no-optional-locks',
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '-z',
  ])
  const remotes = await git(cwd, ['remote'])
  const repo: Omit<SourceControlRepo, 'path'> = {
    head: null,
    branch: null,
    upstream: null,
    remote: remotes.stdout.trim() !== '',
    ahead: 0,
    behind: 0,
    merge: [],
    staged: [],
    changes: [],
  }
  const tokens = output.stdout.split('\0')
  for (let index = 0; index < tokens.length; index++) {
    const fields = tokens[index].split(' ')
    if (fields[0] === '#' && fields[1] === 'branch.oid') {
      repo.head = fields[2] === '(initial)' ? null : fields[2]
    }
    if (fields[0] === '#' && fields[1] === 'branch.head') {
      repo.branch = fields[2] === '(detached)' ? null : fields[2]
    }
    if (fields[0] === '#' && fields[1] === 'branch.upstream') {
      repo.upstream = fields[2]
    }
    if (fields[0] === '#' && fields[1] === 'branch.ab') {
      repo.ahead = Number(fields[2])
      repo.behind = -Number(fields[3])
    }
    if (fields[0] === '?') {
      repo.changes.push({
        path: tokens[index].slice(2),
        from: null,
        status: 'U',
      })
    }
    if (fields[0] === 'u') {
      repo.merge.push({
        path: fields.slice(10).join(' '),
        from: null,
        status: '!',
      })
    }
    if (fields[0] === '1' || fields[0] === '2') {
      const renamed = fields[0] === '2'
      const file = fields.slice(renamed ? 9 : 8).join(' ')
      const from = renamed ? tokens[index + 1] : null
      if (fields[1][0] !== '.') {
        repo.staged.push({ path: file, from, status: letter(fields[1][0]) })
      }
      if (fields[1][1] !== '.') {
        repo.changes.push({
          path: file,
          from: null,
          status: letter(fields[1][1]),
        })
      }
      if (renamed) {
        index++
      }
    }
  }
  return repo
}

function letter(code: string): GitStatus {
  if (
    code === 'M' ||
    code === 'T' ||
    code === 'A' ||
    code === 'D' ||
    code === 'R' ||
    code === 'C'
  ) {
    return code
  }
  throw new Error(`Unknown git status ${code}`)
}
