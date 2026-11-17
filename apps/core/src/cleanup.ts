export type CleanupItem =
  | {
      id: string
      kind: 'worktree'
      project: string | null
      folder: string
      branch: string | null
      reason: 'merged' | 'pushed' | 'unpushed'
      since: number
      changes: number
      commits: number
      bytes: number
    }
  | {
      id: string
      kind: 'chat'
      title: string | null
      folder: string
      since: number
      bytes: number
    }
  | {
      id: string
      kind: 'uploads' | 'pasted' | 'logs' | 'generations' | 'reviewGuides'
      count: number
      bytes: number
    }

export type CleanupState = {
  checkedAt: number | null
  checking: boolean
  items: CleanupItem[]
}
