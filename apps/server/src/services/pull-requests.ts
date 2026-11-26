import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  MergeMethod,
  PullRequestAction,
  PullRequestCheck,
  PullRequestChecks,
  PullRequestDetails,
  PullRequestFilter,
  PullRequestList,
  PullRequestSummary,
} from '@offsite/core/pull-requests'
import { git, gitError, projectRepos } from './git.ts'
import { githubCache } from './github-cache.ts'
import {
  LIST_QUERY,
  type RawAuthor,
  type RawCheck,
  type RawDetails,
  type RawListItem,
  type RawRollupState,
  type RawSummary,
  VIEW_QUERY,
} from './pull-request-queries.ts'

const run = promisify(execFile)
const lists = githubCache<string>(30_000, 100)
const views = githubCache<string>(15_000, 50)
const diffs = githubCache<string>(Infinity, 30)
const repoUrls = githubCache<string>(60 * 60_000, 20)

const stateQualifiers: Record<PullRequestFilter['state'], string> = {
  open: 'is:open',
  closed: 'is:closed is:unmerged',
  merged: 'is:merged',
  all: '',
}

const scopeQualifiers: Record<PullRequestFilter['scope'], string> = {
  all: '',
  mine: 'author:@me',
  review: 'review-requested:@me',
  assigned: 'assignee:@me',
}

export async function listPullRequests(
  root: string,
  chosen: string | null,
  filter: PullRequestFilter,
  after: string | null,
  fresh: boolean
): Promise<PullRequestList> {
  const repos = await remoteRepos(root)
  if (repos.length === 0) {
    throw new Error('This project has no git repository with a remote.')
  }
  const repo = chosen ?? repos[0]
  if (!repos.includes(repo)) {
    throw new Error(`${repo} is not a git repository with a remote`)
  }
  const cwd = path.join(root, repo)
  const target = githubRepo(
    (
      await repoUrls.get(cwd, false, () =>
        gh(cwd, ['repo', 'view', '--json', 'url', '--jq', '.url'])
      )
    ).trim()
  )
  const search = [
    `repo:${target.owner}/${target.name}`,
    'is:pr',
    'sort:updated-desc',
    stateQualifiers[filter.state],
    scopeQualifiers[filter.scope],
    filter.search.trim(),
  ]
    .filter(Boolean)
    .join(' ')
  const results = await Promise.all([
    lists.get(`${target.host} ${after} ${search}`, fresh, () =>
      gh(cwd, [
        'api',
        'graphql',
        '--hostname',
        target.host,
        ...(after === null ? [] : ['-f', `after=${after}`]),
        '-f',
        `search=${search}`,
        '-f',
        `query=${LIST_QUERY}`,
      ])
    ),
    currentBranch(cwd),
  ])
  const raw: {
    data: {
      search: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: RawListItem[]
      }
    }
  } = JSON.parse(results[0])
  const found = raw.data.search
  return {
    repos,
    path: repo,
    repo: `${target.owner}/${target.name}`,
    current: results[1],
    items: found.nodes.map((item) =>
      summary(
        item,
        item.latest.nodes.at(0)?.commit.statusCheckRollup?.state ?? null
      )
    ),
    next: found.pageInfo.hasNextPage ? found.pageInfo.endCursor : null,
  }
}

export async function viewPullRequest(
  target: string,
  fresh: boolean
): Promise<Omit<PullRequestDetails, 'local' | 'current'>> {
  const repo = repoOf(target)
  const raw: {
    data: {
      viewer: { login: string }
      repository: {
        squashMergeAllowed: boolean
        mergeCommitAllowed: boolean
        rebaseMergeAllowed: boolean
        pullRequest: RawDetails
      }
    }
  } = JSON.parse(
    await views.get(target, fresh, () =>
      gh(os.homedir(), [
        'api',
        'graphql',
        '--hostname',
        repo.host,
        '-f',
        `owner=${repo.owner}`,
        '-f',
        `name=${repo.name}`,
        '-F',
        `number=${repo.number}`,
        '-f',
        `query=${VIEW_QUERY}`,
      ])
    )
  )
  const settings = raw.data.repository
  const pull = settings.pullRequest
  const rollup = pull.latest.nodes.at(0)?.commit.statusCheckRollup ?? null
  const methods: MergeMethod[] = []
  if (settings.squashMergeAllowed) {
    methods.push('squash')
  }
  if (settings.mergeCommitAllowed) {
    methods.push('merge')
  }
  if (settings.rebaseMergeAllowed) {
    methods.push('rebase')
  }
  return {
    ...summary(pull, rollup === null ? null : rollup.state),
    headOid: pull.headRefOid,
    viewer: raw.data.viewer.login,
    body: pull.body,
    createdAt: Date.parse(pull.createdAt),
    mergeState: pull.mergeStateStatus,
    changedFiles: pull.changedFiles,
    crossRepository: pull.isCrossRepository,
    methods,
    checkList: rollup === null ? [] : rollup.contexts.nodes.map(check),
    reviews: pull.latestReviews.nodes.map((review) => ({
      author: login(review.author),
      state: review.state,
    })),
    commits: pull.commits.nodes.map((node) => ({
      hash: node.commit.oid,
      subject: node.commit.messageHeadline,
      author: commitAuthor(node.commit.authors.nodes),
      date: Date.parse(node.commit.committedDate),
    })),
    comments: pull.comments.nodes.map((comment) => ({
      author: login(comment.author),
      body: comment.body,
      date: Date.parse(comment.createdAt),
    })),
    files: pull.files === null ? [] : pull.files.nodes,
  }
}

export function pullRequestDiff(target: string, head: string) {
  return diffs.get(`${target}@${head}`, false, () =>
    gh(os.homedir(), ['pr', 'diff', target, '--color', 'never'])
  )
}

export async function runPullRequestAction(
  cwd: string,
  target: string,
  action: PullRequestAction
) {
  try {
    await runAction(cwd, target, action)
  } finally {
    lists.clear()
    views.clear()
  }
}

async function runAction(
  cwd: string,
  target: string,
  action: PullRequestAction
) {
  if (action.kind === 'merge') {
    const head = action.deleteBranch
      ? (
          await gh(cwd, [
            'pr',
            'view',
            target,
            '--json',
            'headRefName',
            '--jq',
            '.headRefName',
          ])
        ).trim()
      : null
    await gh(cwd, ['pr', 'merge', target, `--${action.method}`])
    if (head !== null) {
      const repo = repoOf(target)
      await gh(cwd, [
        'api',
        '--hostname',
        repo.host,
        '--method',
        'DELETE',
        `repos/${repo.owner}/${repo.name}/git/refs/heads/${head}`,
      ])
    }
    return
  }
  if (action.kind === 'close') {
    await gh(cwd, ['pr', 'close', target])
    return
  }
  if (action.kind === 'reopen') {
    await gh(cwd, ['pr', 'reopen', target])
    return
  }
  if (action.kind === 'ready') {
    await gh(cwd, ['pr', 'ready', target])
    return
  }
  if (action.kind === 'draft') {
    await gh(cwd, ['pr', 'ready', target, '--undo'])
    return
  }
  if (action.kind === 'checkout') {
    await gh(cwd, ['pr', 'checkout', target])
    return
  }
  if (action.kind === 'approve') {
    await gh(cwd, ['pr', 'review', target, '--approve'])
    return
  }
  if (action.kind === 'requestChanges') {
    await gh(cwd, [
      'pr',
      'review',
      target,
      '--request-changes',
      '--body',
      action.body,
    ])
    return
  }
  if (action.kind === 'comment') {
    await gh(cwd, ['pr', 'comment', target, '--body', action.body])
    return
  }
  throw new Error(`unknown pull request action ${JSON.stringify(action)}`)
}

export async function gh(cwd: string, args: string[]) {
  try {
    return (
      await run('gh', args, {
        cwd,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
        maxBuffer: 64 * 1024 * 1024,
      })
    ).stdout
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'GitHub CLI (gh) is not installed. Install it and run gh auth login.',
        { cause: error }
      )
    }
    throw gitError(error)
  }
}

export async function currentBranch(cwd: string) {
  const branch = (await git(cwd, ['branch', '--show-current'])).stdout.trim()
  return branch === '' ? null : branch
}

async function remoteRepos(root: string) {
  const repos = await projectRepos(root)
  const remotes = await Promise.all(
    repos.map(
      async (repo) =>
        (await git(path.join(root, repo), ['remote'])).stdout.trim() !== ''
    )
  )
  return repos.filter((_, index) => remotes[index])
}

function githubRepo(url: string) {
  const match = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url)
  if (match === null) {
    throw new Error(`${url} is not a GitHub repository URL`)
  }
  return { host: match[1], owner: match[2], name: match[3] }
}

export function repoOf(url: string) {
  const match = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(url)
  if (match === null) {
    throw new Error(`${url} is not a pull request URL`)
  }
  return { host: match[1], owner: match[2], name: match[3], number: match[4] }
}

function summary(
  raw: RawSummary,
  rollup: RawRollupState | null
): PullRequestSummary {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    draft: raw.isDraft,
    author: login(raw.author),
    head: raw.headRefName,
    base: raw.baseRefName,
    additions: raw.additions,
    deletions: raw.deletions,
    updatedAt: Date.parse(raw.updatedAt),
    review: raw.reviewDecision,
    checks: rollupChecks(rollup),
    mergeable: raw.mergeable,
    labels: raw.labels.nodes.map((label) => ({
      name: label.name,
      color: label.color,
    })),
  }
}

function login(author: RawAuthor) {
  return author === null ? 'ghost' : author.login
}

function commitAuthor(authors: { name: string; user: RawAuthor }[]) {
  const first = authors.at(0)
  if (first === undefined) {
    return ''
  }
  return first.user === null ? first.name : first.user.login
}

function rollupChecks(state: RawRollupState | null): PullRequestChecks {
  if (state === null) {
    return null
  }
  if (state === 'SUCCESS') {
    return 'passing'
  }
  if (state === 'FAILURE' || state === 'ERROR') {
    return 'failing'
  }
  if (state === 'PENDING' || state === 'EXPECTED') {
    return 'pending'
  }
  throw new Error(`unknown check rollup state ${state}`)
}

function check(raw: RawCheck): PullRequestCheck {
  if (raw.__typename === 'StatusContext') {
    return {
      name: raw.context,
      status: contextStatus(raw.state),
      url: raw.targetUrl === '' ? null : raw.targetUrl,
    }
  }
  return {
    name: raw.name,
    status: checkRunStatus(raw.status, raw.conclusion),
    url: raw.detailsUrl === '' ? null : raw.detailsUrl,
  }
}

function contextStatus(state: string): PullRequestCheck['status'] {
  if (state === 'SUCCESS') {
    return 'passing'
  }
  if (state === 'FAILURE' || state === 'ERROR') {
    return 'failing'
  }
  if (state === 'PENDING' || state === 'EXPECTED') {
    return 'pending'
  }
  throw new Error(`unknown status state ${state}`)
}

function checkRunStatus(
  status: string,
  conclusion: string | null
): PullRequestCheck['status'] {
  if (
    ['IN_PROGRESS', 'PENDING', 'QUEUED', 'REQUESTED', 'WAITING'].includes(
      status
    )
  ) {
    return 'pending'
  }
  if (status !== 'COMPLETED') {
    throw new Error(`unknown check status ${status}`)
  }
  if (conclusion === null) {
    throw new Error('completed check without a conclusion')
  }
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') {
    return 'passing'
  }
  if (conclusion === 'SKIPPED') {
    return 'skipped'
  }
  if (
    [
      'ACTION_REQUIRED',
      'CANCELLED',
      'FAILURE',
      'STALE',
      'STARTUP_FAILURE',
      'TIMED_OUT',
    ].includes(conclusion)
  ) {
    return 'failing'
  }
  throw new Error(`unknown check conclusion ${conclusion}`)
}
