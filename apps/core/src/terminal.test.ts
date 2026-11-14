import { describe, expect, it } from 'vitest'
import { GLOBAL_TERMINALS, terminalViewOf } from './terminal.ts'

describe('terminalViewOf', () => {
  it('groups terminals of a worktree apart from its project', () => {
    expect(terminalViewOf({ projectId: 'project', worktreeId: null })).toBe(
      'project'
    )
    expect(
      terminalViewOf({ projectId: 'project', worktreeId: 'worktree' })
    ).toBe('worktree')
  })

  it('groups terminals without a project together', () => {
    expect(terminalViewOf({ projectId: null, worktreeId: null })).toBe(
      GLOBAL_TERMINALS
    )
  })
})
