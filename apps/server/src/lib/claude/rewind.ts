import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import type { Run } from './run.ts'

const ATTEMPTS = 10

const answerSchema = z.object({
  response: z.discriminatedUnion('rewound', [
    z.object({ rewound: z.literal(true) }),
    z.object({
      rewound: z.literal(false),
      reason: z.string(),
      error: z.string(),
    }),
  ]),
})

export async function rewindLive(
  run: Run,
  messageId: string,
  lastSeenId: string
) {
  const request = Reflect.get(run.query, 'request')
  if (typeof request !== 'function') {
    throw new Error('This Claude Code version cannot rewind a live session')
  }
  for (let attempt = 1; ; attempt++) {
    const answer = answerSchema.parse(
      await Reflect.apply(request, run.query, [
        {
          subtype: 'rewind_conversation',
          target_message_uuid: messageId,
          last_seen_user_message_uuid: lastSeenId,
        },
      ])
    ).response
    if (answer.rewound) {
      break
    }
    if (answer.reason !== 'turn_running' || attempt === ATTEMPTS) {
      throw new Error(`Claude Code could not rewind: ${answer.error}`)
    }
    await sleep(500)
  }
  const index = run.messages.findIndex((item) => item.uuid === messageId)
  const removed = run.messages.splice(index < 0 ? 0 : index)
  run.cut = messageId
  const tools = new Set(
    removed.flatMap((item) =>
      item.type === 'user' || item.type === 'assistant'
        ? item.content.flatMap((block) =>
            block.type === 'tool_use' ? [block.id] : []
          )
        : []
    )
  )
  await Promise.all(
    [...run.taskTools]
      .filter(
        (entry) => tools.has(entry[0]) && run.tasks[entry[1]] === 'running'
      )
      .map((entry) => run.query.stopTask(entry[1]))
  )
}

export function visible<T extends { uuid: string }>(run: Run, disk: T[]) {
  const index = disk.findIndex((item) => item.uuid === run.cut)
  return index < 0 ? disk : disk.slice(0, index)
}
