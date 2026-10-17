import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { GitStatus } from '@offsite/core/protocol'
import { claudeOptions } from '../lib/claude/index.ts'
import { codexCommitMessage } from '../lib/codex/index.ts'
import { openCodeCommitMessage } from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { assertEnabled } from './accounts.ts'

const DIFF_LIMIT = 80_000
const UNTRACKED_LIMIT = 100
const NEW_FILE_LIMIT = 256 * 1024
const REPO_DEPTH = 3
const run = promisify(execFile)

export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  let output
  try {
    output = await git(cwd, ['status', '--porcelain=v2', '--branch'])
  } catch {
    return null
  }
  const status: GitStatus = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: 0,
  }
  for (const line of output.stdout.split('\n').filter(Boolean)) {
    const [marker, key, ...rest] = line.split(' ')
    if (marker !== '#') status.changed++
    else if (key === 'branch.head')
      status.branch = rest[0] === '(detached)' ? null : rest[0]
    else if (key === 'branch.upstream') status.upstream = rest[0]
    else if (key === 'branch.ab') {
      status.ahead = Number(rest[0])
      status.behind = -Number(rest[1])
    }
  }
  return status
}

export async function commit(cwd: string, message: string) {
  if (message.trim() === '') throw new Error('Write a commit message first')
  await git(cwd, ['add', '--all'])
  await git(cwd, ['commit', '--message', message])
  return gitStatus(cwd)
}

export async function push(cwd: string) {
  const status = await gitStatus(cwd)
  if (status === null) throw new Error(`${cwd} is not a git repository`)
  if (status.upstream === null)
    await git(cwd, ['push', '--set-upstream', 'origin', 'HEAD'])
  else await git(cwd, ['push'])
  return gitStatus(cwd)
}

export async function createPullRequest(cwd: string) {
  const url = (await run('gh', ['pr', 'create', '--fill'], { cwd })).stdout
    .trim()
    .split('\n')
    .at(-1)
  if (url === undefined) throw new Error('gh did not return a pull request URL')
  return { url }
}

export async function suggestCommitMessage(cwd: string) {
  const settings = readConfig().commitMessage
  const provider = settings.provider
  const accountId = settings.accountId
  const model = settings.model
  if (provider === null || model === null)
    throw new Error('Choose a commit message model in Settings → Git')
  assertEnabled(provider, accountId)
  if (!(await isRepo(cwd))) throw new Error(`${cwd} is not a git repository`)
  const diff = (await repoDiff(cwd, '')).slice(0, DIFF_LIMIT)
  if (diff === '') throw new Error('There is nothing to commit')
  const prompt = `Write a git commit message for this diff. Reply with only the message: a short summary line, optionally followed by a blank line and a brief body.\n\n${diff}`
  if (provider === 'codex')
    return codexCommitMessage(accountId, cwd, model, prompt)
  if (provider === 'opencode') return openCodeCommitMessage(cwd, model, prompt)
  const conversation = query({
    prompt,
    options: {
      ...claudeOptions(accountId, cwd),
      systemPrompt: 'You write concise git commit messages.',
      tools: [],
      model,
      maxTurns: 1,
      persistSession: false,
    },
  })
  for await (const message of conversation) {
    if (message.type !== 'result') continue
    if (message.subtype !== 'success')
      throw new Error(message.errors.join('\n'))
    if (message.is_error) throw new Error(message.result)
    return { message: message.result.trim() }
  }
  throw new Error('Claude did not reply')
}

export async function projectDiff(cwd: string) {
  if (await isRepo(cwd)) return repoDiff(cwd, '')
  const repos = childRepos(cwd, '', REPO_DEPTH)
  if (repos.length === 0)
    throw new Error(`${cwd} is not a git repository and has none inside it`)
  const diffs = await Promise.all(
    repos.map((repo) => repoDiff(path.join(cwd, repo), `${repo}/`))
  )
  return diffs.join('')
}

export function git(cwd: string, args: string[]) {
  return run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
}

async function isRepo(cwd: string) {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
    return true
  } catch {
    return false
  }
}

async function repoDiff(repo: string, prefix: string) {
  const tracked = await git(repo, [
    'diff',
    await diffBase(repo),
    '--no-color',
    '--no-ext-diff',
    `--src-prefix=a/${prefix}`,
    `--dst-prefix=b/${prefix}`,
  ])
  const untracked = await git(repo, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ])
  const added = untracked.stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, UNTRACKED_LIMIT)
    .map((file) => newFilePatch(repo, file, prefix))
  return [tracked.stdout, ...added].join('')
}

async function diffBase(repo: string) {
  try {
    await git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD'])
    return 'HEAD'
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 1))
      throw error
  }
  const empty = await git(repo, ['hash-object', '-t', 'tree', '/dev/null'])
  return empty.stdout.trim()
}

function childRepos(root: string, dir: string, depth: number): string[] {
  if (depth === 0) return []
  let entries
  try {
    entries = readdirSync(path.join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules'
    )
    .flatMap((entry) => {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`
      return existsSync(path.join(root, relative, '.git'))
        ? [relative]
        : childRepos(root, relative, depth - 1)
    })
}

function newFilePatch(cwd: string, file: string, prefix: string) {
  const name = `${prefix}${file}`
  const header = `diff --git a/${name} b/${name}\nnew file\n--- /dev/null\n+++ b/${name}\n`
  const full = path.join(cwd, file)
  if (statSync(full).size > NEW_FILE_LIMIT)
    return `${header}Binary or large file\n`
  const content = readFileSync(full, 'utf8')
  if (content.includes('\0')) return `${header}Binary or large file\n`
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return `${header}@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}\n`).join('')}`
}
