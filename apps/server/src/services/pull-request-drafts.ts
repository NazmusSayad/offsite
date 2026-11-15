import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PullRequestDraft } from '@offsite/core/git'
import { generateText, threadSettings } from './generate-text.ts'
import { commit, DIFF_LIMIT, git, gitStatus, push } from './git.ts'

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

export async function preparePullRequest(
  cwd: string,
  base: string,
  commitChanges: boolean,
  sessionId: string | null
): Promise<PullRequestDraft> {
  const head = (await gitStatus(cwd)).branch
  if (head === null) {
    throw new Error('Not on a branch')
  }
  if (commitChanges) {
    await commit(cwd, '', true, sessionId)
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
    await generateText('pull-request', threadSettings(sessionId), cwd, {
      instructions: PULL_REQUEST_INSTRUCTIONS,
      prompt: `Commits between base and head:\n${commits}\n\n${diff}\n\nGenerate the pull request Markdown document from the above.`,
    })
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
