import { randomUUID } from 'node:crypto'
import type { Notice } from '@offsite/core/push'
import { broadcast, type Client } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { notifierConnected, sendPush } from './push.ts'

const log = logger.withTag('notices')

const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const KEEP = 24 * 60 * 60 * 1000

export type NoticeButton =
  | { title: string; kind: 'open' | 'diff' }
  | { title: string; kind: 'run'; run: (client: Client) => Promise<unknown> }

export type NoticeInput = Omit<Notice, 'id' | 'tag' | 'actions' | 'target'> & {
  session: { sessionId: string; projectId: string }
  buttons: NoticeButton[]
}

const stored = new Map<
  string,
  { at: number; runs: Map<string, (client: Client) => Promise<unknown>> }
>()

export async function notify(input: NoticeInput) {
  const id = randomUUID()
  const runs = new Map<string, (client: Client) => Promise<unknown>>()
  const notice: Notice = {
    id,
    tag: `session:${input.session.sessionId}`,
    title: trim(input.title, TITLE_LIMIT),
    body: trim(input.body, BODY_LIMIT),
    summary: trim(input.summary, TITLE_LIMIT),
    source: input.source,
    state: input.state,
    image: input.image,
    actions: input.buttons.slice(0, 2).map((button, index) => {
      const action = String(index)
      if (button.kind === 'run') {
        runs.set(action, button.run)
      }
      return { id: action, title: button.title, kind: button.kind }
    }),
    whileVisible: input.whileVisible,
    target: {
      projectId: input.session.projectId,
      sessionId: input.session.sessionId,
    },
  }
  forgetOld()
  stored.set(id, { at: Date.now(), runs })
  if (notifierConnected()) {
    broadcast({ type: 'notice', notice })
    return 'local'
  }
  return (await sendPush(notice)) ? 'push' : 'none'
}

export async function act(client: Client, id: string, action: string) {
  const run = stored.get(id)?.runs.get(action)
  if (run === undefined) {
    throw new Error('This notification is no longer available')
  }
  log.info(`running action ${action} of notification ${id}`)
  await run(client)
}

function forgetOld() {
  for (const entry of stored) {
    if (Date.now() - entry[1].at > KEEP) {
      stored.delete(entry[0])
    }
  }
}

function trim(text: string, limit: number) {
  const characters = [...text]
  if (characters.length <= limit) {
    return text
  }
  return `${characters.slice(0, limit - 1).join('')}…`
}
