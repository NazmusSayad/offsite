import { history, Run } from '../lib/claude/index.ts'
import { type Client, publish } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { threadSettings } from './generate-text.ts'
import { moveToNewWorktree, worktreeState } from './project-worktrees.ts'
import { locked } from './runs.ts'
import { findSession, providerOf } from './sessions.ts'
import { placeSession, setUpWorktree } from './worktree-sessions.ts'

export function moveToWorktree(
  client: Client,
  sessionId: string,
  name: string | null
) {
  return locked(sessionId, async () => {
    if (providerOf(sessionId) !== 'claude') {
      throw new Error('Only Claude Code chats can move to a new worktree')
    }
    const session = await findSession(sessionId)
    if (session === null) {
      throw new Error('offsite cannot find this chat, reload the page')
    }
    if (session.claudeWorktree) {
      throw new Error(
        'Claude Code moved this chat into its own worktree. Ask it to leave that worktree first'
      )
    }
    const run = runs.get(sessionId)
    if (run !== undefined && run.provider !== 'claude') {
      throw new Error('Only Claude Code chats can move to a new worktree')
    }
    if (run?.running === true) {
      throw new Error('Wait for this turn to finish before moving the chat')
    }
    if (run !== undefined && run.backgroundTasks > 0) {
      throw new Error(
        'Wait for background tasks to finish before moving the chat'
      )
    }
    const thread = threadSettings(sessionId)
    if (run !== undefined) {
      run.stop()
      await run.closed
    }
    const worktree = await moveToNewWorktree(
      session,
      name,
      session.title,
      thread
    )
    placeSession(
      sessionId,
      { projectId: session.projectId, worktreeId: worktree.id },
      false
    )
    if (worktree.warning !== null) {
      client.send({ type: 'warning', message: worktree.warning })
    }
    if (run !== undefined) {
      new Run({
        sessionId,
        cwd: worktree.cwd,
        resume: true,
        resumeAt: null,
        settings: run.settings,
      })
    }
    publish(sessionId, await history(sessionId))
    return {
      worktreeId: worktree.id,
      branch: worktree.branch,
      setup: setUpWorktree(worktree.id),
    }
  })
}

export function moveToMain(sessionId: string) {
  return locked(sessionId, async () => {
    if (providerOf(sessionId) !== 'claude') {
      throw new Error('Only Claude Code chats can switch to the main project')
    }
    const session = await findSession(sessionId)
    if (session === null) {
      throw new Error('offsite cannot find this chat, reload the page')
    }
    if (session.worktreeId === null) {
      throw new Error('This chat is not in a worktree')
    }
    if ((await worktreeState(session.worktreeId)) !== 'branchMissing') {
      throw new Error(
        'Only a chat whose worktree folder and branch are gone can switch to the main project'
      )
    }
    const run = runs.get(sessionId)
    if (run?.running === true) {
      throw new Error('Wait for this turn to finish before switching')
    }
    if (run !== undefined) {
      run.stop()
      await run.closed
    }
    placeSession(
      sessionId,
      { projectId: session.projectId, worktreeId: null },
      false
    )
    return null
  })
}
