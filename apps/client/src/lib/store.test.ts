import { describe, expect, it } from 'vitest'
import { placePathOf, type State } from './store'

const state = {
  projects: [{ machine: 'machine', id: 'project', path: '/repo' }],
  worktrees: [
    {
      machine: 'machine',
      id: 'worktree',
      projectId: 'project',
      path: '/worktrees/repo/feature',
      branch: 'feature',
    },
  ],
} as unknown as State

describe('placePathOf', () => {
  it('uses the project folder without a worktree', () => {
    expect(placePathOf(state, 'machine', 'project', null)).toBe('/repo')
  })

  it('uses the worktree folder with a worktree', () => {
    expect(placePathOf(state, 'machine', 'project', 'worktree')).toBe(
      '/worktrees/repo/feature'
    )
  })

  it('finds nothing for a removed worktree', () => {
    expect(placePathOf(state, 'machine', 'project', 'removed')).toBe(undefined)
  })

  it('finds nothing on another machine', () => {
    expect(placePathOf(state, 'other', 'project', 'worktree')).toBe(undefined)
  })
})
