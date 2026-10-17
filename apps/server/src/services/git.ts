import { execFile } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { GitRepo, PullRequestDraft } from '@offsite/core/git'
import { claudeOptions } from '../lib/claude/index.ts'
import { codexText } from '../lib/codex/index.ts'
import { openCodeText } from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { assertEnabled } from './accounts.ts'

const DIFF_LIMIT = 80_000
const UNTRACKED_LIMIT = 100
const NEW_FILE_LIMIT = 256 * 1024
const REPO_DEPTH = 3
const run = promisify(execFile)

const PULL_REQUEST_INSTRUCTIONS = `You write GitHub pull requests as Markdown.

## TITLE RULES

- Use the conventional commits format: type(scope): subject
- Types: feat, fix, docs, style, refactor, perf, test, chore, ci
- Scope is optional; include it when the change targets a clear area
- Subject: imperative mood, lowercase, no trailing period
- Maximum 72 characters in total
- Describe the overall change, not a single commit

## BODY RULES

- Use short Markdown sections with level-2 headings. Choose only sections that fit the change: \`New features\`, \`Improvements\`, \`Fixes\`, \`Before\` / \`After\`, or \`Breaking changes\`. Do not use all of them as a template.
- Use bullet points under every section, never paragraphs. Each bullet describes one feature or change in one short sentence.
- For a small change, use one section with one bullet. For larger changes, use only the sections needed, with at most three short bullets across the body.
- Aim for 20-50 words; fewer is better when enough. Never exceed 80 words.
- Describe the outcome, not the implementation walkthrough. Do not enumerate changed files, functions, commits, or incidental cleanup; reviewers can read the diff.
- Add a \`Breaking changes\` section only for an actual compatibility break or required migration.
- No generic \`Summary\` section, bold labels, checklists, boilerplate openings like "This pull request", or closing summaries.

## RULES

Base every statement on the provided commits and diff; do NOT invent details.

## OUTPUT

Return one Markdown document. The title is the level-1 heading (\`# <title>\`), and everything after it is the body.`

export async function gitRepos(cwd: string) {
  return Promise.all(
    (await projectRepos(cwd)).map(async (repo) => ({
      ...(await gitStatus(path.join(cwd, repo))),
      path: repo,
    }))
  )
}

export async function commit(cwd: string, message: string, andPush: boolean) {
  const text = message.trim() === '' ? await commitMessage(cwd) : message
  await git(cwd, ['add', '--all'])
  await git(cwd, ['commit', '--message', text])
  if (andPush) {
    try {
      await push(cwd)
    } catch (error) {
      throw new Error(
        `Committed, but push failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  }
  return { message: text }
}

export async function push(cwd: string) {
  const status = await gitStatus(cwd)
  if (status.branch === null) {
    throw new Error('Cannot push a detached HEAD')
  }
  try {
    if (status.upstream === null) {
      await git(cwd, ['push', '--set-upstream', 'origin', 'HEAD'])
    } else {
      await git(cwd, ['push'])
    }
  } catch (error) {
    throw new Error(
      (error instanceof Error ? error.message : String(error))
        .split('\n')
        .filter(
          (line) =>
            line.trim() !== '' &&
            !line.startsWith('hint:') &&
            !line.startsWith('Command failed:')
        )
        .join('\n'),
      { cause: error }
    )
  }
}

export async function localBranches(cwd: string) {
  return (
    await git(cwd, [
      'branch',
      '--sort=-committerdate',
      '--format=%(refname:short)',
    ])
  ).stdout
    .split('\n')
    .filter(Boolean)
}

export async function switchBranch(
  cwd: string,
  branch: string,
  create: boolean
) {
  await git(cwd, create ? ['switch', '--create', branch] : ['switch', branch])
}

export async function pullRequestBranches(cwd: string) {
  const head = (await gitStatus(cwd)).branch
  if (head === null) {
    throw new Error('Not on a branch')
  }
  const base = (
    await run(
      'gh',
      [
        'repo',
        'view',
        '--json',
        'defaultBranchRef',
        '--jq',
        '.defaultBranchRef.name',
      ],
      { cwd }
    )
  ).stdout.trim()
  if (base === head) {
    throw new Error(`${head} is the default branch. Create a branch first.`)
  }
  const branches = (await git(cwd, ['ls-remote', '--heads', 'origin'])).stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('refs/heads/')[1])
    .filter((branch) => branch !== head)
  return { head, base, branches }
}

export async function preparePullRequest(
  cwd: string,
  base: string,
  commitChanges: boolean
): Promise<PullRequestDraft> {
  const head = (await gitStatus(cwd)).branch
  if (head === null) {
    throw new Error('Not on a branch')
  }
  if (commitChanges) {
    await commit(cwd, '', true)
  }
  const status = await gitStatus(cwd)
  if (status.upstream === null || status.ahead > 0) {
    await push(cwd)
  }
  const open = (
    await run(
      'gh',
      [
        'pr',
        'list',
        '--head',
        head,
        '--base',
        base,
        '--state',
        'open',
        '--json',
        'url',
        '--jq',
        '.[0].url // ""',
      ],
      { cwd }
    )
  ).stdout.trim()
  if (open !== '') {
    return { kind: 'open', url: open }
  }
  await git(cwd, ['fetch', 'origin', base])
  const commits = (
    await git(cwd, ['log', '--format=- %B', `origin/${base}..HEAD`])
  ).stdout.trim()
  if (commits === '') {
    throw new Error(`No commits between ${base} and ${head}`)
  }
  const diff = (
    await git(cwd, [
      'diff',
      '--no-color',
      '--no-ext-diff',
      `origin/${base}...HEAD`,
    ])
  ).stdout.slice(0, DIFF_LIMIT)
  const lines = (
    await generateText(
      cwd,
      PULL_REQUEST_INSTRUCTIONS,
      `Commits between base and head:\n${commits}\n\n${diff}\n\nGenerate the pull request Markdown document from the above.`
    )
  ).split('\n')
  const title = lines[0]
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(\*\*|__|\*|_|`)+/, '')
    .replace(/(\*\*|__|\*|_|`)+$/, '')
    .trim()
  if (title === '') {
    throw new Error('The model returned an empty title')
  }
  return {
    kind: 'draft',
    base,
    head,
    title,
    body: lines.slice(1).join('\n').trim(),
  }
}

export async function createPullRequest(
  cwd: string,
  request: { base: string; head: string; title: string; body: string }
) {
  const url = (
    await run(
      'gh',
      [
        'pr',
        'create',
        '--title',
        request.title,
        '--body',
        request.body,
        '--base',
        request.base,
        '--head',
        request.head,
        '--assignee',
        '@me',
      ],
      { cwd }
    )
  ).stdout
    .trim()
    .split('\n')
    .at(-1)
  if (url === undefined) {
    throw new Error('gh did not return a pull request URL')
  }
  return { url }
}

async function commitMessage(cwd: string) {
  const diff = (await repoDiff(cwd, '')).slice(0, DIFF_LIMIT)
  if (diff === '') {
    throw new Error('There is nothing to commit')
  }
  return generateText(
    cwd,
    'You write concise git commit messages.',
    `Write a git commit message for this diff. Reply with only the message: a short summary line, optionally followed by a blank line and a brief body.\n\n${diff}`
  )
}

async function generateText(cwd: string, instructions: string, prompt: string) {
  const settings = readConfig().commitMessage
  const provider = settings.provider
  const accountId = settings.accountId
  const model = settings.model
  if (provider === null || model === null) {
    throw new Error('Choose a model in Settings → Git')
  }
  assertEnabled(provider, accountId)
  if (provider === 'codex') {
    return codexText(accountId, cwd, model, instructions, prompt)
  }
  if (provider === 'opencode') {
    return openCodeText(cwd, model, `${instructions}\n\n${prompt}`)
  }
  const conversation = query({
    prompt,
    options: {
      ...claudeOptions(accountId, cwd),
      systemPrompt: instructions,
      tools: [],
      model,
      maxTurns: 1,
      persistSession: false,
    },
  })
  for await (const message of conversation) {
    if (message.type !== 'result') {
      continue
    }
    if (message.subtype !== 'success') {
      throw new Error(message.errors.join('\n'))
    }
    if (message.is_error) {
      throw new Error(message.result)
    }
    return message.result.trim()
  }
  throw new Error('Claude did not reply')
}

export async function projectDiff(cwd: string) {
  const repos = await projectRepos(cwd)
  if (repos.length === 0) {
    throw new Error(`${cwd} is not a git repository and has none inside it`)
  }
  const diffs = await Promise.all(
    repos.map((repo) =>
      repoDiff(path.join(cwd, repo), repo === '' ? '' : `${repo}/`)
    )
  )
  return diffs.join('')
}

export function git(cwd: string, args: string[]) {
  return run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
}

async function projectRepos(cwd: string) {
  return (await isRepo(cwd)) ? [''] : childRepos(cwd, '', REPO_DEPTH)
}

async function gitStatus(cwd: string) {
  const output = await git(cwd, ['status', '--porcelain=v2', '--branch'])
  const status: Omit<GitRepo, 'path'> = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    changed: 0,
  }
  for (const line of output.stdout.split('\n').filter(Boolean)) {
    const [marker, key, ...rest] = line.split(' ')
    if (marker !== '#') {
      status.changed++
    } else if (key === 'branch.head') {
      status.branch = rest[0] === '(detached)' ? null : rest[0]
    } else if (key === 'branch.upstream') {
      status.upstream = rest[0]
    } else if (key === 'branch.ab') {
      status.ahead = Number(rest[0])
      status.behind = -Number(rest[1])
    }
  }
  return status
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
    if (!(error instanceof Error && 'code' in error && error.code === 1)) {
      throw error
    }
  }
  const empty = await git(repo, ['hash-object', '-t', 'tree', '/dev/null'])
  return empty.stdout.trim()
}

function childRepos(root: string, dir: string, depth: number): string[] {
  if (depth === 0) {
    return []
  }
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
  if (lstatSync(full).isSymbolicLink()) {
    return `${header}@@ -0,0 +1 @@\n+${readlinkSync(full)}\n`
  }
  if (statSync(full).size > NEW_FILE_LIMIT) {
    return `${header}Binary or large file\n`
  }
  const content = readFileSync(full, 'utf8')
  if (content.includes('\0')) {
    return `${header}Binary or large file\n`
  }
  const lines = content.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return `${header}@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}\n`).join('')}`
}
