import type {
  PullRequestState,
  PullRequestSummary,
} from '@offsite/core/pull-requests'

const SUMMARY_FIELDS = `
  number title url state isDraft author { login } headRefName baseRefName
  additions deletions updatedAt reviewDecision mergeable
  labels(first: 100) { nodes { name color } }`

export const LIST_QUERY = `query($search: String!, $after: String) {
  search(query: $search, type: ISSUE, first: 25, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        ${SUMMARY_FIELDS}
        latest: commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
      }
    }
  }
}`

export const VIEW_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed
    pullRequest(number: $number) {
      ${SUMMARY_FIELDS}
      body createdAt headRefOid mergeStateStatus changedFiles isCrossRepository
      latestReviews(first: 100) { nodes { author { login } state } }
      commits(first: 100) {
        nodes {
          commit {
            oid messageHeadline committedDate
            authors(first: 1) { nodes { name user { login } } }
          }
        }
      }
      comments(first: 100) { nodes { author { login } body createdAt } }
      files(first: 100) { nodes { path additions deletions } }
      latest: commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              state
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun { name status conclusion detailsUrl }
                  ... on StatusContext { context state targetUrl }
                }
              }
            }
          }
        }
      }
    }
  }
}`

export type RawCheck =
  | {
      __typename: 'CheckRun'
      name: string
      status: string
      conclusion: string | null
      detailsUrl: string | null
    }
  | {
      __typename: 'StatusContext'
      context: string
      state: string
      targetUrl: string | null
    }

export type RawAuthor = { login: string } | null

export type RawRollupState =
  | 'SUCCESS'
  | 'FAILURE'
  | 'ERROR'
  | 'PENDING'
  | 'EXPECTED'

export type RawSummary = {
  number: number
  title: string
  url: string
  state: PullRequestState
  isDraft: boolean
  author: RawAuthor
  headRefName: string
  baseRefName: string
  additions: number
  deletions: number
  updatedAt: string
  reviewDecision: PullRequestSummary['review']
  mergeable: PullRequestSummary['mergeable']
  labels: { nodes: { name: string; color: string }[] }
}

export type RawListItem = RawSummary & {
  latest: {
    nodes: { commit: { statusCheckRollup: { state: RawRollupState } | null } }[]
  }
}

export type RawDetails = RawSummary & {
  headRefOid: string
  body: string
  createdAt: string
  mergeStateStatus: string
  changedFiles: number
  isCrossRepository: boolean
  latestReviews: { nodes: { author: RawAuthor; state: string }[] }
  commits: {
    nodes: {
      commit: {
        oid: string
        messageHeadline: string
        committedDate: string
        authors: { nodes: { name: string; user: RawAuthor }[] }
      }
    }[]
  }
  comments: {
    nodes: { author: RawAuthor; body: string; createdAt: string }[]
  }
  files: {
    nodes: { path: string; additions: number; deletions: number }[]
  } | null
  latest: {
    nodes: {
      commit: {
        statusCheckRollup: {
          state: RawRollupState
          contexts: { nodes: RawCheck[] }
        } | null
      }
    }[]
  }
}
