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
}

export type PullRequestList = {
  repo: string
  viewer: string
  current: string | null
  items: PullRequestSummary[]
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

export type ReviewGuide = {
  head: string
  createdAt: number
  stops: ReviewGuideStop[]
}

export type ReviewGuideState = {
  guides: ReviewGuide[]
  head: string
  running: boolean
}
