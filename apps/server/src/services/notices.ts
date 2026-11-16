import { randomUUID } from 'node:crypto'
import type { Notice } from '@offsite/core/push'
import { broadcast, type Client, clients } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { sendPush } from './push.ts'

const log = logger.withTag('notices')

const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const KEEP = 24 * 60 * 60 * 1000
const ACTIVE_LIMIT = 15_000
const ANSWER_LIMIT = 2000

export type NoticeButton =
  | { title: string; kind: 'open' | 'diff' }
  | { title: string; kind: 'run'; run: (client: Client) => Promise<unknown> }

export type NoticeInput = Omit<Notice, 'id' | 'tag' | 'actions' | 'target'> & {
  session: { sessionId: string; projectId: string; worktreeId: string | null }
  buttons: NoticeButton[]
}

const stored = new Map<
  string,
  { at: number; runs: Map<string, (client: Client) => Promise<unknown>> }
>()
const asking = new Map<string, (here: boolean) => void>()

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
      worktreeId: input.session.worktreeId,
      sessionId: input.session.sessionId,
    },
  }
  forgetOld()
  stored.set(id, { at: Date.now(), runs })
  const active = [...clients].filter(
    (client) => Date.now() - client.activeAt < ACTIVE_LIMIT
  )
  if (active.length > 0 && (await anyoneHere(active, notice))) {
    return { local: true, push: false }
  }
  const pushed = await sendPush(notice)
  broadcast({ type: 'notice', notice, pushed })
  return { local: clients.size > 0, push: pushed }
}

export async function act(client: Client, id: string, action: string) {
  const run = stored.get(id)?.runs.get(action)
  if (run === undefined) {
    throw new Error('This notification is no longer available')
  }
  log.info(`running action ${action} of notification ${id}`)
  await run(client)
}

export function receiveAnswer(id: string, here: boolean) {
  asking.get(id)?.(here)
}

function anyoneHere(active: Client[], notice: Notice) {
  return new Promise<boolean>((resolve) => {
    let waiting = active.length
    const timer = setTimeout(() => finish(false), ANSWER_LIMIT)
    function finish(here: boolean) {
      clearTimeout(timer)
      asking.delete(notice.id)
      resolve(here)
    }
    asking.set(notice.id, (here) => {
      waiting -= 1
      if (here || waiting === 0) {
        finish(here)
      }
    })
    for (const client of active) {
      client.send({ type: 'notice.ask', notice })
    }
  })
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
