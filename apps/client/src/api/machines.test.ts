import type { Project } from '@offsite/core/projects'
import { describe, expect, it } from 'vitest'
import { restoreProjects, type StoredMachine } from './machines'

function project(id: string, extra: object): Project {
  return {
    id,
    path: `/${id}`,
    name: id,
    logo: null,
    pinned: false,
    hidden: false,
    scratch: false,
    worktreeSetup: null,
    startInWorktree: false,
    score: 0,
    ...extra,
  }
}

describe('restoreProjects', () => {
  it('drops worktrees cached as projects by an older version', () => {
    const machine: StoredMachine = {
      id: 'machine',
      addresses: [],
      name: 'Machine',
      icon: null,
      label: null,
      pairedAt: null,
      listId: null,
      listName: null,
      listAddresses: [],
      projects: [
        project('current', {}),
        project('old-root', { parentId: null, worktreeBranch: null }),
        project('old-worktree', { parentId: 'old-root', worktreeBranch: 'b' }),
      ],
    }

    expect(restoreProjects(machine).map((item) => item.id)).toEqual([
      'current',
      'old-root',
    ])
  })
})
