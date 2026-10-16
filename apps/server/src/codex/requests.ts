import type { Item, PermissionRequest } from '../protocol.ts'
import type { Params } from './app-server.ts'
import { itemId } from './items.ts'
import type { Question } from './types.ts'

export function toRequest(
  requestId: string,
  method: string,
  params: Params,
  items: Map<string, Item>
): PermissionRequest | null {
  const turnId = params.turnId as string
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return {
        id: requestId,
        kind: 'approval',
        title: (params.reason as string | null) ?? 'Run this command?',
        canAlwaysAllow: true,
        item: items.get(itemId(turnId, params.itemId as string)) ?? {
          id: itemId(turnId, params.itemId as string),
          parent: null,
          time: Date.now(),
          kind: 'command',
          command: (params.command as string | null) ?? '',
          description: '',
          output: '',
          status: 'running',
          background: null,
        },
      }
    case 'item/fileChange/requestApproval':
      return {
        id: requestId,
        kind: 'approval',
        title: (params.reason as string | null) ?? 'Apply these changes?',
        canAlwaysAllow: true,
        item: items.get(`${itemId(turnId, params.itemId as string)}:0`) ?? {
          id: itemId(turnId, params.itemId as string),
          parent: null,
          time: Date.now(),
          kind: 'tool',
          name: 'apply_patch',
          input: {},
          output: '',
          status: 'running',
        },
      }
    case 'item/permissions/requestApproval':
      return {
        id: requestId,
        kind: 'approval',
        title: (params.reason as string | null) ?? 'Grant these permissions?',
        canAlwaysAllow: true,
        item: {
          id: itemId(turnId, params.itemId as string),
          parent: null,
          time: Date.now(),
          kind: 'tool',
          name: 'permissions',
          input: params.permissions as Record<string, unknown>,
          output: '',
          status: 'running',
        },
      }
    case 'item/tool/requestUserInput':
      return {
        id: requestId,
        kind: 'question',
        questions: (params.questions as Question[]).map((question) => ({
          question: question.question,
          header: question.header,
          multiSelect: false,
          options: question.options ?? [],
        })),
      }
    default:
      return null
  }
}

export function reply(
  method: string,
  params: Params,
  decision: 'allow' | 'always' | 'deny',
  answers: Record<string, string> | null
) {
  switch (method) {
    case 'item/commandExecution/requestApproval':
    case 'item/fileChange/requestApproval':
      return {
        decision: {
          allow: 'accept',
          always: 'acceptForSession',
          deny: 'decline',
        }[decision],
      }
    case 'item/permissions/requestApproval':
      return decision === 'deny'
        ? { permissions: {}, scope: 'turn' }
        : {
            permissions: params.permissions,
            scope: decision === 'always' ? 'session' : 'turn',
          }
    case 'item/tool/requestUserInput':
      return {
        answers: Object.fromEntries(
          (params.questions as Question[]).flatMap((question) => {
            const answer = answers?.[question.question]
            return decision === 'deny' || answer === undefined
              ? []
              : [[question.id, { answers: [answer] }]]
          })
        ),
      }
  }
  throw new Error(`offsite cannot answer ${method}`)
}
