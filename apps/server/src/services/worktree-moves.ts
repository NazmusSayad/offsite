import { history, Run } from '../lib/claude/index.ts'
import { type Client, publish } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { moveProjectToWorktree } from './projects.ts'
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
    if (run !== undefined) {
      run.stop()
      await run.closed
    }
    const project = await moveProjectToWorktree(
      session.projectId,
      name,
      session.title
    )
    placeSession(sessionId, project.id, false)
    if (project.warning !== null) {
      client.send({ type: 'warning', message: project.warning })
    }
    if (run !== undefined) {
      new Run({
        sessionId,
        cwd: project.cwd,
        resume: true,
        resumeAt: null,
        settings: run.settings,
      })
    }
    publish(sessionId, await history(sessionId, project.cwd))
    return {
      projectId: project.id,
      branch: project.branch,
      setup: setUpWorktree(project.id),
    }
  })
}
