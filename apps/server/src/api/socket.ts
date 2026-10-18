import os from 'node:os'
import path from 'node:path'
import type { RpcCall, RpcMethod, RpcMethods } from '@offsite/core/protocol'
import type { WebSocket } from 'ws'
import { agentMessages, earlier, image } from '../lib/claude/index.ts'
import { codexAgent } from '../lib/codex/index.ts'
import { type Client, clients } from '../lib/hub.ts'
import { activity, runs } from '../lib/live.ts'
import { openCodeAgent } from '../lib/opencode/index.ts'
import {
  accounts,
  addAccount,
  capabilities,
  publishAccounts,
  removeAccount,
  stopProvider,
  updateAccount,
} from '../services/accounts.ts'
import {
  linkProjectDownload,
  linkProjectMedia,
  listFiles,
  readProjectFile,
  saveUpload,
  taskOutput,
} from '../services/files.ts'
import {
  commit,
  createPullRequest,
  fetchProject,
  gitRepos,
  localBranches,
  preparePullRequest,
  projectDiff,
  pullRequestBranches,
  push,
  switchBranch,
  sync,
} from '../services/git.ts'
import {
  addProject,
  directories,
  projectPath,
  projects,
  removeProject,
  updateProject,
} from '../services/projects.ts'
import { claimNotifier, subscribe, unsubscribe } from '../services/push.ts'
import { open, rewind, send } from '../services/runs.ts'
import {
  fork,
  providerOf,
  providerStatuses,
  publishSessions,
  recordInteraction,
  refreshAll,
  removeSession,
  sessions,
  updateSession,
  watchSessions,
} from '../services/sessions.ts'
import { listShells } from '../services/terminal/process.ts'
import {
  busyTerminal,
  detachTerminal,
  savePastedImage,
  terminalInput,
  terminalRequest,
} from '../services/terminal/terminal.ts'
import { configInfo, readConfig, saveConfig } from '../storage/config.ts'
import { readComposer, saveComposer } from '../storage/state.ts'

type Handlers = {
  [M in RpcMethod]: (
    params: RpcMethods[M]['params'],
    client: Client
  ) => RpcMethods[M]['result'] | Promise<RpcMethods[M]['result']>
}

const handlers: Handlers = {
  ping: () => null,
  sync: () => {
    refreshAll()
    return {
      ...configInfo(),
      composer: readComposer(),
      hostname: os.hostname(),
      projects: projects(),
      sessions: sessions(),
      providers: providerStatuses(),
      activity: activity(),
    }
  },
  'config.get': () => configInfo(),
  'composer.get': () => readComposer(),
  'composer.save': (params) => saveComposer(params),
  'config.save': async (params) => {
    const before = readConfig()
    const saved = saveConfig(params)
    for (const provider of ['claude', 'codex', 'opencode'] as const) {
      if (
        before.enabledProviders[provider] &&
        !saved.enabledProviders[provider]
      ) {
        await stopProvider(provider)
      }
    }
    if (
      JSON.stringify(saved.claudeBaseDir) ===
        JSON.stringify(before.claudeBaseDir) &&
      JSON.stringify(saved.enabledProviders) ===
        JSON.stringify(before.enabledProviders)
    ) {
      return saved
    }
    watchSessions()
    refreshAll()
    void publishAccounts()
    return saved
  },
  'projects.add': async (params) => {
    const project = await addProject(params.path)
    refreshAll()
    return project
  },
  'projects.update': (params) => updateProject(params.id, params.patch),
  'projects.remove': (params) => {
    removeProject(params.id)
    refreshAll()
    return null
  },
  'directories.list': (params) => directories(params.path),
  'sessions.update': async (params) => {
    try {
      await updateSession(params.id, params.patch)
    } finally {
      publishSessions()
    }
    return null
  },
  'sessions.remove': async (params) => {
    try {
      await removeSession(params.id)
    } finally {
      publishSessions()
    }
    return null
  },
  'sessions.open': async (params, client) => {
    await open(client, params.sessionId, params.projectId)
    return null
  },
  'sessions.earlier': (params) => earlier(params.sessionId, params.before),
  'sessions.image': (params) =>
    image(params.sessionId, params.itemId, params.index),
  'sessions.agent': (params) => {
    switch (providerOf(params.sessionId)) {
      case 'claude':
        return agentMessages(
          params.sessionId,
          projectPath(params.projectId),
          params.agentId,
          params.parent
        )
      case 'codex':
        return codexAgent(params.agentId, params.parent)
      case 'opencode':
        return openCodeAgent(params.agentId, params.parent)
    }
  },
  'sessions.send': async (params, client) => {
    await send(client, params)
    return null
  },
  'sessions.unqueue': (params) => {
    runs.get(params.sessionId)?.unqueue(params.id)
    return null
  },
  'sessions.steer': (params) => {
    runs.get(params.sessionId)?.steer(params.id)
    return null
  },
  'sessions.interrupt': async (params) => {
    await runs.get(params.sessionId)?.interrupt()
    return null
  },
  'sessions.stopTask': async (params) => {
    await runs.get(params.sessionId)?.stopTask(params.taskId)
    return null
  },
  'sessions.configure': async (params) => {
    await runs.get(params.sessionId)?.configure(params.settings)
    return null
  },
  'sessions.respond': async (params) => {
    const run = runs.get(params.sessionId)
    if (run === undefined) {
      return null
    }
    await run.respond(params.requestId, params.decision, params.answers)
    recordInteraction(params.sessionId)
    return null
  },
  'sessions.rewind': (params) => rewind(params),
  'sessions.fork': async (params) => {
    const result = await fork(
      params.sessionId,
      params.projectId,
      params.messageId
    )
    publishSessions()
    return result
  },
  'accounts.list': () => accounts(),
  'accounts.add': (params) => {
    addAccount(params.provider, params.name, params.configDir)
    void publishAccounts()
    return null
  },
  'accounts.update': async (params) => {
    await updateAccount(params)
    void publishAccounts()
    return null
  },
  'accounts.remove': (params) => {
    removeAccount(params.id)
    void publishAccounts()
    return null
  },
  capabilities: (params) =>
    capabilities(
      params.provider,
      params.accountId,
      params.projectId === null ? os.homedir() : projectPath(params.projectId)
    ),
  'files.list': (params) => listFiles(projectPath(params.projectId)),
  'files.read': (params) =>
    readProjectFile(projectPath(params.projectId), params.path),
  'files.media': (params) =>
    linkProjectMedia(projectPath(params.projectId), params.path),
  'files.download': (params) =>
    linkProjectDownload(projectPath(params.projectId), params.path),
  'files.upload': (params) =>
    saveUpload(params.name, Buffer.from(params.data, 'base64')),
  'tasks.output': (params) => taskOutput(params.sessionId, params.path),
  'git.status': (params) => gitRepos(projectPath(params.projectId)),
  'git.diff': (params) => projectDiff(projectPath(params.projectId)),
  'git.commit': (params) =>
    commit(
      path.join(projectPath(params.projectId), params.repo),
      params.message,
      params.push
    ),
  'git.push': async (params) => {
    await push(path.join(projectPath(params.projectId), params.repo))
    return null
  },
  'git.sync': async (params) => {
    await sync(path.join(projectPath(params.projectId), params.repo))
    return null
  },
  'git.fetch': async (params) => {
    await fetchProject(projectPath(params.projectId))
    return null
  },
  'git.branches': (params) =>
    pullRequestBranches(path.join(projectPath(params.projectId), params.repo)),
  'git.localBranches': (params) =>
    localBranches(path.join(projectPath(params.projectId), params.repo)),
  'git.switch': async (params) => {
    await switchBranch(
      path.join(projectPath(params.projectId), params.repo),
      params.branch,
      params.create
    )
    return null
  },
  'git.pullRequest': (params) =>
    preparePullRequest(
      path.join(projectPath(params.projectId), params.repo),
      params.base,
      params.commit
    ),
  'git.createPullRequest': (params) =>
    createPullRequest(
      path.join(projectPath(params.projectId), params.repo),
      params
    ),
  'push.subscribe': (params, client) => {
    subscribe(params, client)
    return null
  },
  'push.unsubscribe': (params) => {
    unsubscribe(params.endpoint)
    return null
  },
  'notifications.claim': (params, client) => {
    claimNotifier(client, params.endpoint)
    return null
  },
  terminal: async (params, client) => {
    await terminalRequest(client, params)
    return null
  },
  'terminal.shells': () => listShells(),
  'terminal.busy': (params) => busyTerminal(params.id),
  'terminal.paste': (params) =>
    savePastedImage(params.type, Buffer.from(params.data, 'base64')),
}

export function connectClient(socket: WebSocket) {
  const client: Client = {
    socket,
    heardAt: Date.now(),
    opening: null,
    sessionId: null,
    send: (message) => socket.send(JSON.stringify(message)),
  }
  clients.add(client)
  socket.on('message', (data, isBinary) => {
    client.heardAt = Date.now()
    if (isBinary) {
      terminalInput(client, data as Buffer)
      return
    }
    void answer(client, String(data))
  })
  socket.on('error', (error) =>
    console.warn(`a browser connection failed: ${error}`)
  )
  socket.on('close', () => {
    clients.delete(client)
    detachTerminal(client)
  })
}

async function answer(client: Client, text: string) {
  let call: RpcCall
  try {
    call = JSON.parse(text) as RpcCall
  } catch (error) {
    console.warn(`ignoring a message that is not JSON: ${error}`)
    return
  }
  try {
    if (!Object.hasOwn(handlers, call.method)) {
      throw new Error(`unknown method ${call.method}`)
    }
    const handler = handlers[call.method] as (
      params: unknown,
      client: Client
    ) => unknown
    const result = await handler(call.params, client)
    client.send({ type: 'reply', id: call.id, result })
  } catch (error) {
    client.send({
      type: 'reply',
      id: call.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
