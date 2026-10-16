import os from 'node:os'
import type { WebSocket } from 'ws'
import {
  accounts,
  addAccount,
  capabilities,
  publishAccounts,
  removeAccount,
  updateAccount,
} from './accounts.ts'
import { codexAgent } from './codex/sessions.ts'
import { configInfo, readConfig, saveConfig } from './config.ts'
import { listFiles, readProjectFile, saveUpload, taskOutput } from './files.ts'
import {
  commit,
  createPullRequest,
  gitStatus,
  projectDiff,
  push,
  suggestCommitMessage,
} from './git.ts'
import { agentMessages, earlier, image } from './history.ts'
import { type Client, clients } from './hub.ts'
import { activity, runs } from './live.ts'
import { openCodeAgent } from './opencode/sessions.ts'
import {
  addProject,
  directories,
  projects,
  removeProject,
  updateProject,
} from './projects.ts'
import { type Call, type Method, type Methods, PROTOCOL } from './protocol.ts'
import { pushKey, subscribe, unsubscribe } from './push.ts'
import { open, rewind, send } from './runs.ts'
import {
  fork,
  providerOf,
  publishSessions,
  recordInteraction,
  removeSession,
  sessions,
  updateSession,
  watchSessions,
} from './sessions.ts'
import { listShells } from './terminal/process.ts'
import {
  busyTerminal,
  detachTerminal,
  savePastedImage,
  terminalInput,
  terminalRequest,
} from './terminal/terminal.ts'

type Handlers = {
  [M in Method]: (
    params: Methods[M]['params'],
    client: Client
  ) => Methods[M]['result'] | Promise<Methods[M]['result']>
}

const handlers: Handlers = {
  ping: () => null,
  sync: async () => ({
    ...configInfo(),
    protocol: PROTOCOL,
    hostname: os.hostname(),
    projects: projects(),
    sessions: await sessions(),
    activity: activity(),
  }),
  'config.get': () => configInfo(),
  'config.save': (params) => {
    const before = readConfig().claudeBaseDir
    const saved = saveConfig(params)
    if (saved.claudeBaseDir === before) return saved
    watchSessions()
    void publishSessions()
    void publishAccounts()
    return saved
  },
  'projects.add': async (params) => {
    const project = await addProject(params.path)
    void publishSessions()
    return project
  },
  'projects.update': (params) => updateProject(params.path, params.patch),
  'projects.remove': (params) => {
    removeProject(params.path)
    void publishSessions()
    return null
  },
  'directories.list': (params) => directories(params.path),
  'sessions.update': async (params) => {
    try {
      await updateSession(params.id, params.patch)
    } finally {
      void publishSessions()
    }
    return null
  },
  'sessions.remove': async (params) => {
    try {
      await removeSession(params.id)
    } finally {
      void publishSessions()
    }
    return null
  },
  'sessions.open': async (params, client) => {
    await open(client, params.sessionId, params.cwd)
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
          params.cwd,
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
    if (run === undefined) return null
    await run.respond(params.requestId, params.decision, params.answers)
    recordInteraction(params.sessionId)
    return null
  },
  'sessions.rewind': (params) => rewind(params),
  'sessions.fork': async (params) => {
    const result = await fork(params.sessionId, params.cwd, params.messageId)
    void publishSessions()
    return result
  },
  'accounts.list': () => accounts(),
  'accounts.add': (params) => {
    addAccount(params.provider, params.name, params.configDir)
    void publishAccounts()
    return null
  },
  'accounts.update': (params) => {
    updateAccount(params.id, params.name, params.configDir)
    void publishAccounts()
    return null
  },
  'accounts.remove': (params) => {
    removeAccount(params.id)
    void publishAccounts()
    return null
  },
  capabilities: (params) => capabilities(params.accountId, params.cwd),
  'files.list': (params) => listFiles(params.cwd),
  'files.read': (params) => readProjectFile(params.cwd, params.path),
  'files.upload': (params) =>
    saveUpload(params.name, Buffer.from(params.data, 'base64')),
  'tasks.output': (params) => taskOutput(params.sessionId, params.path),
  'git.status': (params) => gitStatus(params.cwd),
  'git.diff': (params) => projectDiff(params.cwd),
  'git.commit': (params) => commit(params.cwd, params.message),
  'git.push': (params) => push(params.cwd),
  'git.pullRequest': (params) => createPullRequest(params.cwd),
  'git.message': (params) =>
    suggestCommitMessage(params.provider, params.accountId, params.cwd),
  'push.key': () => pushKey(),
  'push.subscribe': (params) => {
    subscribe(params)
    return null
  },
  'push.unsubscribe': (params) => {
    unsubscribe(params.endpoint)
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
  let call: Call
  try {
    call = JSON.parse(text) as Call
  } catch (error) {
    console.warn(`ignoring a message that is not JSON: ${error}`)
    return
  }
  try {
    if (!Object.hasOwn(handlers, call.method))
      throw new Error(`unknown method ${call.method}`)
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
