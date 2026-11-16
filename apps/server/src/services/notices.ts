import { randomUUID } from 'node:crypto'
import type { Notice } from '@offsite/core/push'
import { broadcast, type Client, clients } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { sendPush } from './push.ts'

const log = logger.withTag('notices')

const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const KEEP = 24 * 60 * 60 * 1000
const ANSWER_LIMIT = 2000
const SEEN_LIMIT = 60_000

export type NoticeButton =
  | { title: string; kind: 'open' }
  | { title: string; kind: 'run'; run: (client: Client) => Promise<unknown> }

export type NoticeInput = Omit<Notice, 'id' | 'tag' | 'actions' | 'target'> & {
  session: { sessionId: string; projectId: string; worktreeId: string | null }
  buttons: NoticeButton[]
}

const stored = new Map<
  string,
  { at: number; runs: Map<string, (client: Client) => Promise<unknown>> }
>()
const usedAt = new Map<string, number>()
const asking = new Map<string, (client: Client) => void>()

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
  return await offer(notice, new Set())
}

export async function act(client: Client, id: string, action: string) {
  const run = stored.get(id)?.runs.get(action)
  if (run === undefined) {
    throw new Error('This notification is no longer available')
  }
  log.info(`running action ${action} of notification ${id}`)
  await run(client)
}

export function noteUse(client: Client, browser: string) {
  client.browser = browser
  client.usedAt = Date.now()
  usedAt.set(browser, Date.now())
}

export function receiveAnswer(client: Client, id: string, browser: string) {
  client.browser = browser
  asking.get(id)?.(client)
}

async function offer(notice: Notice, tried: Set<string>) {
  const page = await pickAwake(notice.id, tried)
  if (page === null) {
    const pushed = await sendPush(notice)
    broadcast({ type: 'notice', notice, pushed })
    return { local: clients.size > 0, push: pushed }
  }
  const browser = page.browser
  if (browser === null) {
    throw new Error('a page answered without saying which browser it is')
  }
  tried.add(browser)
  const sentAt = Date.now()
  log.info(
    `notification ${notice.id.slice(0, 8)} (${notice.title}): sent to ${page.name}`
  )
  page.send({ type: 'notice', notice, pushed: false })
  setTimeout(() => {
    if (lastUse(browser) > sentAt) {
      return
    }
    log.info(
      `notification ${notice.id.slice(0, 8)}: ${page.name} did not use it within a minute, passing it on`
    )
    offer(notice, tried).catch((error: unknown) =>
      log.warn('could not pass a notification on to the next device:', error)
    )
  }, SEEN_LIMIT)
  return { local: true, push: false }
}

function pickAwake(id: string, tried: Set<string>) {
  return new Promise<Client | null>((resolve) => {
    const asked = [...clients]
    const awake = new Set<Client>()
    const timer = setTimeout(() => choose(true), ANSWER_LIMIT)
    function choose(final: boolean) {
      const ranked = asked
        .filter(
          (client) => client.browser === null || !tried.has(client.browser)
        )
        .sort(
          (first, second) =>
            browserUse(second) - browserUse(first) ||
            second.usedAt - first.usedAt
        )
      for (const client of ranked) {
        if (awake.has(client)) {
          finish(client)
          return
        }
        if (!final) {
          return
        }
      }
      log.info(
        `notification ${id.slice(0, 8)}: ${ranked.length === 0 ? 'every connected page already had it' : 'no other page answered within 2 seconds'}, pushing it to every browser`
      )
      finish(null)
    }
    function finish(client: Client | null) {
      clearTimeout(timer)
      asking.delete(id)
      resolve(client)
    }
    asking.set(id, (client) => {
      if (asked.includes(client)) {
        awake.add(client)
        choose(false)
      }
    })
    for (const client of asked) {
      client.send({ type: 'notice.ask', id })
    }
    if (asked.length === 0) {
      log.info(
        `notification ${id.slice(0, 8)}: no page is connected, pushing it to every browser`
      )
      finish(null)
    }
  })
}

function browserUse(client: Client) {
  return client.browser === null ? 0 : lastUse(client.browser)
}

function lastUse(browser: string) {
  return usedAt.get(browser) ?? 0
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
