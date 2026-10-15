import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { claudeOptions } from './claude.ts'
import type { GitStatus } from './protocol.ts'

const DIFF_LIMIT = 80_000
const UNTRACKED_LIMIT = 100
const NEW_FILE_LIMIT = 256 * 1024

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
  const { stdout } = await promisify(execFile)(
    'gh',
    ['pr', 'create', '--fill'],
    { cwd }
  )
  const url = stdout.trim().split('\n').at(-1)
  if (url === undefined) throw new Error('gh did not return a pull request URL')
  return { url }
}

export async function suggestCommitMessage(accountId: string, cwd: string) {
  const diff = (await workingDiff(cwd)).slice(0, DIFF_LIMIT)
  if (diff === '') throw new Error('There is nothing to commit')
  const conversation = query({
    prompt: `Write a git commit message for this diff. Reply with only the message: a short summary line, optionally followed by a blank line and a brief body.\n\n${diff}`,
    options: {
      ...claudeOptions(accountId, cwd),
      systemPrompt: 'You write concise git commit messages.',
      tools: [],
      model: 'haiku',
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

export async function workingDiff(cwd: string) {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    throw new Error(`${cwd} is not a git repository`)
  }
  const tracked = await git(cwd, [
    'diff',
    'HEAD',
    '--no-color',
    '--no-ext-diff',
  ])
  const untracked = await git(cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
  ])
  const added = untracked.stdout
    .split('\n')
    .filter(Boolean)
    .slice(0, UNTRACKED_LIMIT)
    .map((file) => newFilePatch(cwd, file))
  return [tracked.stdout, ...added].join('')
}

export function git(cwd: string, args: string[]) {
  return promisify(execFile)('git', args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  })
}

function newFilePatch(cwd: string, file: string) {
  const header = `diff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n`
  const full = path.join(cwd, file)
  if (statSync(full).size > NEW_FILE_LIMIT)
    return `${header}Binary or large file\n`
  const content = readFileSync(full, 'utf8')
  if (content.includes('\0')) return `${header}Binary or large file\n`
  const lines = content.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return `${header}@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}\n`).join('')}`
}
