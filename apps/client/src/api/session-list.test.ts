import type { Session } from '@offsite/core/sessions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppStore,
  getState,
  type Selection,
  type State,
} from '@/lib/store'
import { syncUrl } from '@/lib/url'
import { setSessions } from './session-list'

vi.mock('@/lib/url', () => ({ syncUrl: vi.fn() }))

const MACHINE = 'machine'

function chat(projectId: string, worktreeId: string | null): Session {
  return {
    id: 'chat',
    provider: 'claude',
    title: 'Chat',
    projectId,
    worktreeId,
    branch: null,
    updatedAt: 1,
    status: 'active',
    unread: false,
  }
}

function open(selection: Omit<Selection, 'machine' | 'pending'>) {
  createAppStore({
    sessions: [],
    inactiveVersion: 0,
    selection: { machine: MACHINE, pending: null, ...selection },
  } as unknown as State)
}

beforeEach(() => {
  vi.mocked(syncUrl).mockClear()
})

describe('setSessions', () => {
  it('follows the open chat into a worktree', () => {
    open({ projectId: 'project', worktreeId: null, sessionId: 'chat' })

    setSessions(MACHINE, [chat('project', 'worktree')])

    expect(getState().selection).toMatchObject({
      projectId: 'project',
      worktreeId: 'worktree',
      sessionId: 'chat',
    })
    expect(syncUrl).toHaveBeenCalledWith(true)
  })

  it('follows the open chat back to the main folder', () => {
    open({ projectId: 'project', worktreeId: 'worktree', sessionId: 'chat' })

    setSessions(MACHINE, [chat('project', null)])

    expect(getState().selection).toMatchObject({
      projectId: 'project',
      worktreeId: null,
    })
    expect(syncUrl).toHaveBeenCalledWith(true)
  })

  it('keeps the selection when the open chat stays in place', () => {
    open({ projectId: 'project', worktreeId: 'worktree', sessionId: 'chat' })

    setSessions(MACHINE, [chat('project', 'worktree')])

    expect(getState().selection).toMatchObject({ worktreeId: 'worktree' })
    expect(syncUrl).not.toHaveBeenCalled()
  })

  it('ignores another chat that moved', () => {
    open({ projectId: 'project', worktreeId: null, sessionId: 'other' })

    setSessions(MACHINE, [chat('project', 'worktree')])

    expect(getState().selection).toMatchObject({ worktreeId: null })
    expect(syncUrl).not.toHaveBeenCalled()
  })
})
