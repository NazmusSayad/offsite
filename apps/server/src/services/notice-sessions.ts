import { randomUUID } from 'node:crypto'
import type { SessionSettings } from '@offsite/core/config'
import type { Client } from '../lib/hub.ts'
import { readConfig } from '../storage/config.ts'
import { send } from './runs.ts'
import { sessions } from './sessions.ts'

export type NoticeSession = {
  sessionId: string
  projectId: string
  title: string
  settings: SessionSettings
}

export function noticeSession(sessionId: string, settings: SessionSettings) {
  const session = sessions().find((item) => item.id === sessionId)
  if (session === undefined) {
    return null
  }
  return {
    sessionId,
    projectId: session.projectId,
    title: session.title,
    settings,
  }
}

export function sendText(client: Client, session: NoticeSession, text: string) {
  return send(client, {
    id: randomUUID(),
    sessionId: session.sessionId,
    projectId: session.projectId,
    prompt: { text, images: [] },
    settings: session.settings,
    delivery: readConfig().delivery,
    status: null,
    worktree: null,
  })
}
