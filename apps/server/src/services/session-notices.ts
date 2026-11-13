import type {
  Item,
  PermissionDecision,
  PermissionRequest,
} from '@offsite/core/items'
import { type LiveRun, runs } from '../lib/live.ts'
import { logger } from '../lib/log.ts'
import { providerName } from './accounts.ts'
import { noticeImage } from './notice-images.ts'
import {
  type NoticeSession,
  noticeSession,
  sendText,
} from './notice-sessions.ts'
import { type NoticeButton, notify } from './notices.ts'
import { resend } from './runs.ts'
import { sessions } from './sessions.ts'
import { duration, plainText, turnSummary } from './turn-summary.ts'

const log = logger.withTag('session-notices')

const AUTO_RESOLVE_QUIET = 5000

const seen = new Map<
  string,
  { running: boolean; prompted: boolean; requests: Set<string> }
>()

export function watchActivity() {
  for (const run of runs.values()) {
    const before = seen.get(run.sessionId)
    seen.set(run.sessionId, {
      running: run.running,
      prompted: run.prompted,
      requests: new Set(
        [...run.pending.values()].map((pending) => pending.request.id)
      ),
    })
    if (
      !run.running &&
      before?.running === true &&
      before.prompted &&
      !run.failed
    ) {
      report(finishedNotice(run))
    }
    for (const pending of run.pending.values()) {
      if (before?.requests.has(pending.request.id) !== true) {
        report(requestNotice(run, pending.request))
      }
    }
  }
  for (const sessionId of seen.keys()) {
    if (!runs.has(sessionId)) {
      seen.delete(sessionId)
    }
  }
}

export function notSentNotice(
  rows: { id: string; sessionId: string | null; text: string }[]
) {
  for (const row of rows) {
    const session = sessions().find((item) => item.id === row.sessionId)
    if (session === undefined) {
      continue
    }
    report(
      notify({
        title: `Message not sent · ${session.title}`,
        body: `“${row.text}”`,
        summary: 'message not sent',
        source: session.provider,
        state: 'not-sent',
        image: null,
        buttons: [
          {
            title: 'Resend',
            kind: 'run',
            run: (client) => resend(client, row.id),
          },
          { title: 'Edit', kind: 'open' },
        ],
        whileVisible: false,
        session: { sessionId: session.id, projectId: session.projectId },
      })
    )
  }
}

async function finishedNotice(run: LiveRun) {
  const session = noticeSession(run.sessionId, run.settings)
  if (session === null) {
    return
  }
  const summary = await turnSummary(run.sessionId, run.cwd)
  const provider = providerName(run.provider)
  const reply = plainText(summary.reply)
  const stats = [
    summary.files === 0
      ? null
      : `${summary.files} ${summary.files === 1 ? 'file' : 'files'} · +${summary.lines.added} −${summary.lines.removed}`,
    summary.startedAt === null
      ? null
      : duration(Date.now() - summary.startedAt),
  ].filter((part) => part !== null)
  await notify({
    ...base(run, session),
    body: [reply || `${provider} finished`, stats.join(' · ')]
      .filter((part) => part !== '')
      .join('\n'),
    summary: reply.split('\n')[0] || 'finished',
    state: 'done',
    image: await noticeImage(summary.images),
    buttons: finishedButtons(session, reply, summary.files),
  })
}

function finishedButtons(
  session: NoticeSession,
  reply: string,
  files: number
): NoticeButton[] {
  if (reply.endsWith('?')) {
    return [
      {
        title: 'Yes, go ahead',
        kind: 'run',
        run: (client) => sendText(client, session, 'Yes, go ahead'),
      },
      { title: 'Reply', kind: 'open' },
    ]
  }
  if (files > 0) {
    return [
      { title: 'View diff', kind: 'diff' },
      { title: 'Reply', kind: 'open' },
    ]
  }
  return [{ title: 'Reply', kind: 'open' }]
}

async function requestNotice(run: LiveRun, request: PermissionRequest) {
  if (
    request.autoResolve !== undefined &&
    request.autoResolve.at - Date.now() < AUTO_RESOLVE_QUIET
  ) {
    return
  }
  const session = noticeSession(run.sessionId, run.settings)
  if (session === null) {
    return
  }
  function respond(
    decision: PermissionDecision,
    answers: Record<string, string> | null
  ) {
    return async () => {
      const current = runs.get(run.sessionId)
      if (current === undefined) {
        throw new Error('This session is no longer running')
      }
      await current.respond(request.id, decision, answers)
    }
  }
  if (request.kind === 'question') {
    const question = request.questions[0]
    const single = request.questions.length === 1 && !question.multiSelect
    const recommended = question.options.find((option) =>
      option.label.endsWith('(Recommended)')
    )
    await notify({
      ...base(run, session),
      body:
        question.options.length > 2
          ? `${question.question}\n${question.options.map((option, index) => `${index + 1}. ${option.label}`).join('  ')}`
          : question.question,
      summary: `asks: ${question.question}`,
      state: 'asks',
      buttons:
        single && question.options.length === 2
          ? question.options.map((option): NoticeButton => ({
              title: option.label,
              kind: 'run',
              run: respond('allow', { [question.question]: option.label }),
            }))
          : single && recommended !== undefined
            ? [
                {
                  title: recommended.label.replace(/\s*\(Recommended\)$/, ''),
                  kind: 'run',
                  run: respond('allow', {
                    [question.question]: recommended.label,
                  }),
                },
                { title: 'More options…', kind: 'open' },
              ]
            : [{ title: 'Answer', kind: 'open' }],
    })
    return
  }
  if (request.kind === 'plan') {
    await notify({
      ...base(run, session),
      title: `Plan ready · ${session.title}`,
      body: plainText(request.plan).split('\n').slice(0, 4).join('\n'),
      summary: 'plan ready',
      state: 'approve',
      buttons: [
        { title: 'Review plan', kind: 'open' },
        { title: 'Approve', kind: 'run', run: respond('allow', null) },
      ],
    })
    return
  }
  await notify({
    ...base(run, session),
    title: `${request.title} · ${session.title}`,
    body: approvalBody(request.item),
    summary: `needs approval: ${request.title}`,
    state: 'approve',
    buttons: [
      { title: 'Review', kind: 'open' },
      { title: 'Deny', kind: 'run', run: respond('deny', null) },
    ],
  })
}

function approvalBody(item: Item) {
  switch (item.kind) {
    case 'command':
      return [item.description, `$ ${item.command}`]
        .filter((part) => part !== '')
        .join('\n')
    case 'file_change':
      return `Edit ${item.path}`
    case 'tool':
      return item.name
    default:
      return ''
  }
}

function base(run: LiveRun, session: NoticeSession) {
  return {
    title: session.title,
    source: run.settings.provider,
    image: null,
    whileVisible: false,
    session,
  }
}

function report(work: Promise<unknown>) {
  work.catch((error: unknown) =>
    log.warn('could not send a notification:', error)
  )
}
