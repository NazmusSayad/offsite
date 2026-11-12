import type { SessionContext, SessionRuntime } from '@offsite/core/sessions'
import { skills } from '../lib/codex/index.ts'
import { runs } from '../lib/live.ts'
import { openCode } from '../lib/opencode/client.ts'
import { queuedFor } from './outbox.ts'
import { projectPath } from './projects.ts'
import { sessionHistory } from './runs.ts'

export function runtime(sessionId: string): SessionRuntime | null {
  const run = runs.get(sessionId)
  if (run === undefined) {
    return null
  }
  return {
    provider: run.provider,
    cwd: run.cwd,
    settings: run.settings,
    running: run.running,
    compacting: run.compacting,
    waiting: run.pending.size,
    queued: queuedFor(sessionId).length,
    backgroundTasks: run.backgroundTasks,
    backgroundAgents: run.backgroundAgents,
  }
}

export async function sessionContext(
  sessionId: string,
  projectId: string
): Promise<SessionContext> {
  const run = runs.get(sessionId)
  if (run === undefined) {
    const event = await sessionHistory(sessionId, projectPath(projectId))
    if (event.type !== 'history') {
      throw new Error('Could not read this thread')
    }
    return { usage: event.context, skills: null }
  }
  return { usage: run.context, skills: await loadedSkills(run) }
}

async function loadedSkills(run: NonNullable<ReturnType<typeof runs.get>>) {
  switch (run.provider) {
    case 'claude': {
      const usage = await run.query.getContextUsage({ detail: 'summary' })
      if (usage.skills === undefined) {
        throw new Error('Claude Code did not report its skills')
      }
      return usage.skills.skillFrontmatter.map((skill) => ({
        name: skill.name,
        tokens: skill.tokens,
      }))
    }
    case 'codex':
      return (await skills(run.server, run.cwd)).map((skill) => ({
        name: skill.name,
        tokens: null,
      }))
    case 'opencode': {
      const client = await openCode()
      const result = await client.skill.list({
        location: { directory: run.cwd },
      })
      return result.data.map((skill) => ({ name: skill.name, tokens: null }))
    }
  }
}
