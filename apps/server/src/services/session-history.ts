import type { RpcMethods } from '@offsite/core/protocol'
import { agentMessages, history } from '../lib/claude/index.ts'
import { codexAgent, codexHistory } from '../lib/codex/index.ts'
import { openCodeAgent, openCodeHistory } from '../lib/opencode/index.ts'
import { providerOf } from './sessions.ts'

export function sessionHistory(sessionId: string, cwd: string) {
  switch (providerOf(sessionId)) {
    case 'claude':
      return history(sessionId)
    case 'codex':
      return codexHistory(sessionId)
    case 'opencode':
      return openCodeHistory(sessionId, cwd)
  }
}

export function agentHistory(request: RpcMethods['sessions.agent']['params']) {
  switch (providerOf(request.sessionId)) {
    case 'claude':
      return agentMessages(request)
    case 'codex':
      return codexAgent(request.agentId, request.parent)
    case 'opencode':
      return openCodeAgent(request.agentId, request.parent)
  }
}
