import { broadcastActivity } from '../live.ts'
import { logger } from '../log.ts'
import type { Run } from './run.ts'

export async function loadAgentModels(run: Run) {
  try {
    const agents = await run.query.supportedAgents()
    const models = await run.query.supportedModels()
    run.agentModels = Object.fromEntries(
      agents.flatMap((agent) =>
        agent.model === undefined ? [] : [[agent.name, agent.model]]
      )
    )
    const names: Record<string, string> = Object.fromEntries(
      models.flatMap((model) =>
        model.value === 'default'
          ? []
          : [
              [model.value, model.displayName],
              ...(model.resolvedModel === undefined
                ? []
                : [[model.resolvedModel, model.displayName]]),
            ]
      )
    )
    const fallback = models.find((model) => model.value === 'default')
    const fallbackName =
      fallback?.resolvedModel === undefined
        ? undefined
        : names[fallback.resolvedModel]
    run.modelNames =
      fallbackName === undefined ? names : { ...names, default: fallbackName }
    broadcastActivity()
  } catch (error) {
    logger
      .withTag('claude')
      .warn(`${run.sessionId} could not list agents:`, error)
  }
}
