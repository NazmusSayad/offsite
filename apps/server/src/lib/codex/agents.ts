import type { Params } from './app-server.ts'
import type { ThreadItem } from './types.ts'

export function trackAgents(
  agents: Map<string, boolean>,
  method: string,
  params: Params
) {
  const threadId = params.threadId as string
  if (method === 'turn/started' && agents.has(threadId)) {
    agents.set(threadId, true)
  }
  if (method === 'turn/completed' && agents.has(threadId)) {
    agents.set(threadId, false)
  }
  if (method !== 'item/completed') {
    return
  }
  const item = params.item as ThreadItem
  if (item.type === 'subAgentActivity') {
    if (item.kind === 'started' && !agents.has(item.agentThreadId)) {
      agents.set(item.agentThreadId, true)
    }
    if (
      (item.kind === 'interrupted' || item.kind === 'completed') &&
      agents.has(item.agentThreadId)
    ) {
      agents.set(item.agentThreadId, false)
    }
  }
  if (item.type === 'collabAgentToolCall') {
    if (item.tool === 'spawnAgent') {
      for (const agent of item.receiverThreadIds) {
        if (!agents.has(agent)) {
          agents.set(agent, true)
        }
      }
    }
    for (const [agent, state] of Object.entries(item.agentsStates)) {
      if (agents.get(agent) === true) {
        agents.set(
          agent,
          state.status === 'pendingInit' || state.status === 'running'
        )
      }
    }
  }
}
