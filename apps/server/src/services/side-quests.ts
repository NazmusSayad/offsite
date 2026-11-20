import { randomUUID } from 'node:crypto'
import type { RpcMethods } from '@offsite/core/protocol'
import type { SideQuest } from '@offsite/core/side-quests'
import { asc, eq } from 'drizzle-orm'
import { claudeSideQuest } from '../lib/claude/side-quest.ts'
import { codexSideQuest } from '../lib/codex/side-quest.ts'
import { publish } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { logger } from '../lib/log.ts'
import { sideQuestPrompt } from '../lib/side-quest-prompt.ts'
import { db } from '../storage/db.ts'
import { sideQuests } from '../storage/schema.ts'
import { assertEnabled } from './accounts.ts'
import { placePath } from './project-worktrees.ts'

const log = logger.withTag('side-quests')

export function listSideQuests(sessionId: string): SideQuest[] {
  return db
    .select()
    .from(sideQuests)
    .where(eq(sideQuests.sessionId, sessionId))
    .orderBy(asc(sideQuests.createdAt))
    .all()
}

export function askSideQuest(request: RpcMethods['sideQuests.ask']['params']) {
  const question = request.prompt.text.trim()
  if (question === '' && request.prompt.images.length === 0) {
    throw new Error('Type a question first')
  }
  const settings = runs.get(request.sessionId)?.settings ?? request.settings
  const provider = settings.provider
  if (provider === 'opencode') {
    throw new Error('Side quests work only in Claude and Codex threads')
  }
  assertEnabled(provider, settings.accountId)
  const questId = request.questId ?? randomUUID()
  const earlier = listSideQuests(request.sessionId).filter(
    (quest) => quest.questId === questId
  )
  if (request.questId !== null && earlier.length === 0) {
    throw new Error('This side quest does not exist')
  }
  const prompt = {
    text: sideQuestPrompt(earlier, question),
    images: request.prompt.images,
  }
  const id = randomUUID()
  db.insert(sideQuests)
    .values({
      id,
      sessionId: request.sessionId,
      questId,
      question,
      images: request.prompt.images,
      answer: null,
      status: 'answering',
      error: null,
      createdAt: Date.now(),
    })
    .run()
  publishSideQuests(request.sessionId)
  void settle(id, request.sessionId, async () => {
    switch (provider) {
      case 'claude':
        return claudeSideQuest({
          sessionId: request.sessionId,
          cwd: placePath(request.projectId, request.worktreeId),
          settings,
          prompt,
        })
      case 'codex':
        return codexSideQuest({
          sessionId: request.sessionId,
          settings,
          prompt,
        })
    }
  })
  return { questId }
}

export function failUnansweredSideQuests() {
  db.update(sideQuests)
    .set({
      status: 'failed',
      error: 'offsite restarted before the answer arrived',
    })
    .where(eq(sideQuests.status, 'answering'))
    .run()
}

async function settle(
  id: string,
  sessionId: string,
  answer: () => Promise<string>
) {
  try {
    const text = await answer()
    if (text === '') {
      throw new Error('The agent did not answer')
    }
    db.update(sideQuests)
      .set({ status: 'answered', answer: text })
      .where(eq(sideQuests.id, id))
      .run()
  } catch (error) {
    log.warn(`side quest ${id} failed:`, error)
    db.update(sideQuests)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(sideQuests.id, id))
      .run()
  }
  publishSideQuests(sessionId)
}

function publishSideQuests(sessionId: string) {
  publish(sessionId, {
    type: 'sideQuests',
    sessionId,
    sideQuests: listSideQuests(sessionId),
  })
}
