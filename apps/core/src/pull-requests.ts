export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED'

export type PullRequestFilter = {
  state: 'open' | 'closed' | 'merged' | 'all'
  scope: 'all' | 'mine' | 'review' | 'assigned'
  search: string
}

export type PullRequestChecks = 'passing' | 'failing' | 'pending' | null

export type PullRequestSummary = {
  number: number
  title: string
  url: string
  state: PullRequestState
  draft: boolean
  author: string
  head: string
  base: string
  additions: number
  deletions: number
  updatedAt: number
  review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  checks: PullRequestChecks
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  labels: { name: string; color: string }[]
}

export type PullRequestCheck = {
  name: string
  status: 'passing' | 'failing' | 'pending' | 'skipped'
  url: string | null
}

export type PullRequestDetails = PullRequestSummary & {
  headOid: string
  viewer: string
  current: string | null
  local: boolean
  body: string
  createdAt: number
  mergeState: string
  changedFiles: number
  crossRepository: boolean
  methods: MergeMethod[]
  checkList: PullRequestCheck[]
  reviews: { author: string; state: string }[]
  commits: { hash: string; subject: string; author: string; date: number }[]
  comments: { author: string; body: string; date: number }[]
  files: { path: string; additions: number; deletions: number }[]
}

export type PullRequestList = {
  repos: string[]
  path: string
  repo: string
  current: string | null
  items: PullRequestSummary[]
  next: string | null
}

export type MergeMethod = 'squash' | 'merge' | 'rebase'

export type PullRequestAction =
  | { kind: 'merge'; method: MergeMethod; deleteBranch: boolean }
  | { kind: 'close' }
  | { kind: 'reopen' }
  | { kind: 'ready' }
  | { kind: 'draft' }
  | { kind: 'checkout' }
  | { kind: 'approve' }
  | { kind: 'requestChanges'; body: string }
  | { kind: 'comment'; body: string }

export type ReviewGuideStop = {
  title: string
  summary: string
  attention: {
    kind: 'tradeoff' | 'contract' | 'product' | 'risk' | 'accessibility'
    note: string
  } | null
  excerpts: { path: string; caption: string; patch: string }[]
  files: { path: string; note: string }[]
  notes: { path: string; line: number; title: string; body: string }[]
  questions: string[]
}

export type ReviewGuideCategory =
  | 'core'
  | 'tests'
  | 'dependencies'
  | 'config'
  | 'docs'
  | 'other'

export type ReviewGuide = {
  head: string
  createdAt: number
  stops: ReviewGuideStop[]
  groups?: { path: string; category: ReviewGuideCategory }[]
}

export type ReviewGuideState = {
  guides: ReviewGuide[]
  running: boolean
}

export type PullRequestMethods = {
  'pulls.list': {
    params: {
      projectId: string
      worktreeId: string | null
      repo: string | null
      filter: PullRequestFilter
      after: string | null
      fresh: boolean
    }
    result: PullRequestList
  }
  'pulls.view': {
    params: {
      projectId: string
      worktreeId: string | null
      url: string
      fresh: boolean
    }
    result: PullRequestDetails
  }
  'pulls.diff': {
    params: { url: string; head: string }
    result: string
  }
  'pulls.image': {
    params: { url: string; repository: string | null }
    result: string
  }
  'pulls.run': {
    params: {
      projectId: string
      worktreeId: string | null
      url: string
      action: PullRequestAction
    }
    result: null
  }
  'pulls.guide': {
    params: { url: string }
    result: ReviewGuideState
  }
  'pulls.writeGuide': {
    params: {
      projectId: string
      worktreeId: string | null
      sessionId: string | null
      url: string
    }
    result: ReviewGuideState
  }
}
