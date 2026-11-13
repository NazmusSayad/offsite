import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  MergeMethod,
  PullRequestAction,
  PullRequestCheck,
  PullRequestDetails,
  PullRequestFilter,
  PullRequestList,
  PullRequestState,
  PullRequestSummary,
} from '@offsite/core/pull-requests'
import { git, gitError } from './git.ts'

const LIST_LIMIT = 50
const run = promisify(execFile)

const SUMMARY_FIELDS = [
  'number',
  'title',
  'url',
  'state',
  'isDraft',
  'author',
  'headRefName',
  'baseRefName',
  'additions',
  'deletions',
  'updatedAt',
  'reviewDecision',
  'statusCheckRollup',
  'mergeable',
  'labels',
]

const DETAIL_FIELDS = [
  ...SUMMARY_FIELDS,
  'body',
  'createdAt',
  'mergeStateStatus',
  'changedFiles',
  'isCrossRepository',
  'latestReviews',
  'commits',
  'comments',
]

type RawCheck =
  | {
      __typename: 'CheckRun'
      name: string
      status: string
      conclusion: string
      detailsUrl: string
    }
  | {
      __typename: 'StatusContext'
      context: string
      state: string
      targetUrl: string
    }

type RawSummary = {
  number: number
  title: string
  url: string
  state: PullRequestState
  isDraft: boolean
  author: { login: string }
  headRefName: string
  baseRefName: string
  additions: number
  deletions: number
  updatedAt: string
  reviewDecision: '' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
  statusCheckRollup: RawCheck[] | null
  mergeable: PullRequestSummary['mergeable']
  labels: { name: string; color: string }[]
}

type RawDetails = RawSummary & {
  body: string
  createdAt: string
  mergeStateStatus: string
  changedFiles: number
  isCrossRepository: boolean
  latestReviews: { author: { login: string }; state: string }[]
  commits: {
    oid: string
    messageHeadline: string
    committedDate: string
    authors: { login: string; name: string }[]
  }[]
  comments: { author: { login: string }; body: string; createdAt: string }[]
}

export async function listPullRequests(
  cwd: string,
  filter: PullRequestFilter
): Promise<PullRequestList> {
  const query = [
    'sort:updated-desc',
    filter.state === 'closed' ? 'is:unmerged' : '',
    filter.scope === 'mine' ? 'author:@me' : '',
    filter.scope === 'review' ? 'review-requested:@me' : '',
    filter.scope === 'assigned' ? 'assignee:@me' : '',
    filter.search.trim(),
  ]
    .filter(Boolean)
    .join(' ')
  const results = await Promise.all([
    gh(cwd, [
      'pr',
      'list',
      '--state',
      filter.state,
      '--limit',
      String(LIST_LIMIT),
      '--search',
      query,
      '--json',
      SUMMARY_FIELDS.join(','),
    ]),
    gh(cwd, [
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '--jq',
      '.nameWithOwner',
    ]),
    gh(cwd, ['api', 'user', '--jq', '.login']),
    git(cwd, ['branch', '--show-current']),
  ])
  const raw: RawSummary[] = JSON.parse(results[0])
  return {
    repo: results[1].trim(),
    viewer: results[2].trim(),
    current: results[3].stdout.trim() === '' ? null : results[3].stdout.trim(),
    items: raw.map(summary),
  }
}

export async function viewPullRequest(
  cwd: string,
  number: number
): Promise<PullRequestDetails> {
  const results = await Promise.all([
    gh(cwd, ['pr', 'view', String(number), '--json', DETAIL_FIELDS.join(',')]),
    gh(cwd, [
      'repo',
      'view',
      '--json',
      'squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed',
    ]),
  ])
  const raw: RawDetails = JSON.parse(results[0])
  const settings: {
    squashMergeAllowed: boolean
    mergeCommitAllowed: boolean
    rebaseMergeAllowed: boolean
  } = JSON.parse(results[1])
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
    ...summary(raw),
    body: raw.body,
    createdAt: Date.parse(raw.createdAt),
    mergeState: raw.mergeStateStatus,
    changedFiles: raw.changedFiles,
    crossRepository: raw.isCrossRepository,
    methods,
    checkList: (raw.statusCheckRollup ?? []).map(check),
    reviews: raw.latestReviews.map((review) => ({
      author: review.author.login,
      state: review.state,
    })),
    commits: raw.commits.map((commit) => ({
      hash: commit.oid,
      subject: commit.messageHeadline,
      author: commit.authors[0]?.login ?? commit.authors[0]?.name ?? '',
      date: Date.parse(commit.committedDate),
    })),
    comments: raw.comments.map((comment) => ({
      author: comment.author.login,
      body: comment.body,
      date: Date.parse(comment.createdAt),
    })),
  }
}

export function pullRequestDiff(cwd: string, number: number) {
  return gh(cwd, ['pr', 'diff', String(number), '--color', 'never'])
}

export async function runPullRequestAction(
  cwd: string,
  number: number,
  action: PullRequestAction
) {
  const target = String(number)
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
      await gh(cwd, [
        'api',
        '--method',
        'DELETE',
        `repos/{owner}/{repo}/git/refs/heads/${head}`,
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

function summary(raw: RawSummary): PullRequestSummary {
  const checks = (raw.statusCheckRollup ?? []).map(check)
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    draft: raw.isDraft,
    author: raw.author.login,
    head: raw.headRefName,
    base: raw.baseRefName,
    additions: raw.additions,
    deletions: raw.deletions,
    updatedAt: Date.parse(raw.updatedAt),
    review: raw.reviewDecision === '' ? null : raw.reviewDecision,
    checks: checks.some((item) => item.status === 'failing')
      ? 'failing'
      : checks.some((item) => item.status === 'pending')
        ? 'pending'
        : checks.some((item) => item.status === 'passing')
          ? 'passing'
          : null,
    mergeable: raw.mergeable,
    labels: raw.labels.map((label) => ({
      name: label.name,
      color: label.color,
    })),
  }
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
  conclusion: string
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
