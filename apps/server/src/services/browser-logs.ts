import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { browserLogger } from '../lib/log.ts'
import { readDevices } from '../storage/auth.ts'

const logsBody = z.array(
  z.object({
    time: z.number(),
    type: z.enum([
      'fatal',
      'error',
      'warn',
      'log',
      'info',
      'success',
      'fail',
      'ready',
      'start',
      'box',
      'debug',
      'trace',
      'verbose',
    ]),
    tag: z.string(),
    message: z.string(),
  })
)

export async function saveBrowserLogs(
  device: string | null,
  request: IncomingMessage,
  response: ServerResponse
) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
  }
  let entries
  try {
    entries = logsBody.parse(JSON.parse(body))
  } catch {
    response.statusCode = 400
    response.end('expected [{ time, type, tag, message }]')
    return
  }
  const source =
    device === null
      ? (request.socket.remoteAddress ?? 'unknown address')
      : (readDevices().find((item) => item.hash === device)?.name ?? 'Unnamed')
  for (const entry of entries) {
    browserLogger.log({
      date: new Date(entry.time),
      type: entry.type,
      tag: entry.tag,
      args: [`${source}: ${entry.message}`],
    })
  }
  response.statusCode = 204
  response.end()
}
