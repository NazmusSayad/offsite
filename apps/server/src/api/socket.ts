import { createHash } from 'node:crypto'
import os from 'node:os'
import { NO_PROJECT } from '@offsite/core/projects'
import type { RpcCall, RpcMethod, RpcMethods } from '@offsite/core/protocol'
import type { WebSocket } from 'ws'
import { earlier, image } from '../lib/claude/index.ts'
import { type Client, clients } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { logger } from '../lib/log.ts'
import { openSite } from '../lib/proxy/sites.ts'
import {
  accountLinkPlan,
  accounts,
  addAccount,
  capabilities,
  linkAccount,
  removeAccount,
  updateAccount,
} from '../services/accounts.ts'
import { activityModels } from '../services/activity-models.ts'
import * as bookmarks from '../services/bookmarks.ts'
import { runtime, sessionContext } from '../services/debug.ts'
import { ping, transcribe, workflows } from '../services/dictation.ts'
import { exportSession } from '../services/export.ts'
import {
  createProjectEntry,
  deleteProjectEntry,
  linkBrowse,
  linkProjectDownload,
  linkProjectMedia,
  listEntries,
  listFiles,
  readProjectFile,
  readPath,
  readUpload,
  renameProjectEntry,
  saveUpload,
  taskOutput,
  writeProjectFile,
} from '../services/files.ts'
import { logoFiles, readLogo } from '../services/logos.ts'
import { searchMessages } from '../services/message-search.ts'
import { act, receiveAnswer } from '../services/notices.ts'
import { removeFromOutbox } from '../services/outbox.ts'
import { updatePending } from '../services/pending-status.ts'
import { placePath, publishWorktrees } from '../services/project-worktrees.ts'
import {
  addProject,
  directories,
  projectPath,
  removeProject,
  updateProject,
} from '../services/projects.ts'
import { subscribe, unsubscribe } from '../services/push.ts'
import { open, resend, restart, rewind, send, stop } from '../services/runs.ts'
import { agentHistory } from '../services/session-history.ts'
import { generateSessionTitle } from '../services/session-title.ts'
import {
  findSession,
  fork,
  inactiveSessions,
  publishSessions,
  recordInteraction,
  recordOpen,
  refreshAll,
  searchableSessions,
  updateSession,
} from '../services/sessions.ts'
import { saveSettings } from '../services/settings.ts'
import { syncSnapshot } from '../services/snapshot.ts'
import { savePastedImage } from '../services/terminal/paste.ts'
import { listShells } from '../services/terminal/process.ts'
import {
  busyTerminal,
  detachTerminal,
  terminalInput,
  terminalRequest,
} from '../services/terminal/terminal.ts'
import { readUsage } from '../services/usage.ts'
import { configInfo } from '../storage/config.ts'
import { saveAppIcon } from '../storage/state.ts'
import { gitHandlers } from './git-handlers.ts'
import { pullRequestHandlers } from './pull-request-handlers.ts'
import { serviceHandlers } from './service-handlers.ts'
import { worktreeHandlers } from './worktree-handlers.ts'

const log = logger.withTag('socket')
const ALIVE_INTERVAL = 5000

export type Handlers = {
  [M in RpcMethod]: (
    params: RpcMethods[M]['params'],
    client: Client
  ) => RpcMethods[M]['result'] | Promise<RpcMethods[M]['result']>
}

const handlers: Handlers = {
  ...worktreeHandlers,
  ...serviceHandlers,
  ...pullRequestHandlers,
  ...gitHandlers,
  'config.get': () => configInfo(),
  'appIcon.save': (params) => saveAppIcon(params),
  'config.save': (params) => saveSettings(params),
  'projects.add': async (params) => {
    const project = await addProject(params.path)
    refreshAll()
    return project
  },
  'projects.update': (params) => updateProject(params.id, params.patch),
  'projects.remove': (params) => {
    removeProject(params.id)
    publishWorktrees()
    refreshAll()
    return null
  },
  'projects.logoFiles': (params) => logoFiles(projectPath(params.id)),
  'projects.logoFile': (params) =>
    readLogo(projectPath(params.id), params.path),
  'directories.list': (params) => directories(params.path),
  'sessions.update': async (params) => {
    try {
      await updateSession(params.id, params.patch)
    } finally {
      publishSessions()
    }
    return null
  },
  'sessions.generateTitle': async (params) => {
    await generateSessionTitle(params.id, params.projectId, params.worktreeId)
    return null
  },
  'sessions.open': async (params, client) => {
    const session = await findSession(params.sessionId)
    await open(client, params.sessionId, params)
    if (params.opened && session !== null) {
      recordOpen(params.sessionId, params.query)
    }
    return session
  },
  'sessions.inactive': (params) => inactiveSessions(params),
  'sessions.searchable': () => searchableSessions(),
  'sessions.searchMessages': (params) => searchMessages(params.query),
  'sessions.earlier': (params) => earlier(params.sessionId, params.before),
  'sessions.export': (params) =>
    exportSession(params.sessionId, params.projectId, params.worktreeId),
  'sessions.image': (params) =>
    image(params.sessionId, params.itemId, params.index),
  'sessions.agent': (params) => agentHistory(params),
  'sessions.send': async (params, client) => {
    await send(client, params)
    return null
  },
  'sessions.updatePending': async (params) => {
    await updatePending(params.id, params.status)
    return null
  },
  'sessions.unqueue': (params) => {
    removeFromOutbox(params.id)
    return null
  },
  'sessions.resend': async (params, client) => {
    await resend(client, params.id)
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
  'sessions.restart': async (params) => {
    await restart(params.sessionId)
    return null
  },
  'sessions.stop': async (params) => {
    await stop(params.sessionId)
    return null
  },
  'activity.models': (params) => activityModels(params.sessionIds),
  'sessions.runtime': (params) => runtime(params.sessionId),
  'sessions.context': (params) =>
    sessionContext(params.sessionId, params.projectId, params.worktreeId),
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
    recordInteraction(params.sessionId, run.provider, null)
    return null
  },
  'sessions.rewind': (params, client) => rewind(params, client),
  'sessions.fork': async (params) => {
    const result = await fork(params)
    publishSessions()
    return result
  },
  'bookmarks.list': () => bookmarks.listBookmarks(),
  'bookmarks.add': (params) => bookmarks.addBookmark(params),
  'bookmarks.remove': (params) => bookmarks.removeBookmark(params.id),
  'accounts.list': () => accounts(),
  'accounts.add': (params) =>
    addAccount(params.provider, params.name, params.configDir),
  'accounts.update': (params) => updateAccount(params),
  'accounts.remove': (params) => removeAccount(params.id),
  'accounts.link': (params) => linkAccount(params.id),
  'accounts.linkPlan': (params) => accountLinkPlan(params.id),
  'accounts.usage': (params) => readUsage(params.id, params.force),
  capabilities: (params) =>
    capabilities(
      params.provider,
      params.accountId,
      params.projectId === null || params.projectId === NO_PROJECT
        ? os.homedir()
        : placePath(params.projectId, params.worktreeId)
    ),
  'files.list': (params) =>
    params.projectId === NO_PROJECT
      ? []
      : listFiles(placePath(params.projectId, params.worktreeId)),
  'files.entries': (params) =>
    listEntries(placePath(params.projectId, params.worktreeId)),
  'files.read': (params) =>
    readProjectFile(
      placePath(params.projectId, params.worktreeId),
      params.path
    ),
  'files.write': (params) =>
    writeProjectFile(
      placePath(params.projectId, params.worktreeId),
      params.path,
      params.content,
      params.base
    ),
  'files.create': (params) => {
    createProjectEntry(
      placePath(params.projectId, params.worktreeId),
      params.path,
      params.folder
    )
    return null
  },
  'files.rename': (params) => {
    renameProjectEntry(
      placePath(params.projectId, params.worktreeId),
      params.path,
      params.to
    )
    return null
  },
  'files.delete': (params) => {
    deleteProjectEntry(
      placePath(params.projectId, params.worktreeId),
      params.path
    )
    return null
  },
  'files.media': (params, client) =>
    linkProjectMedia(
      placePath(params.projectId, params.worktreeId),
      params.path,
      client.device
    ),
  'files.download': (params, client) =>
    linkProjectDownload(
      placePath(params.projectId, params.worktreeId),
      params.path,
      client.device
    ),
  'files.readUpload': (params) => readUpload(params.path),
  'files.readPath': (params) => readPath(params.path),
  'files.upload': (params) =>
    saveUpload(params.name, Buffer.from(params.data, 'base64')),
  'dictation.transcribe': (params) =>
    transcribe(Buffer.from(params.audio, 'base64')),
  'dictation.ping': () => ping(),
  'dictation.workflows': () => workflows(),
  'files.browse': (_params, client) =>
    linkBrowse(client.device, client.address),
  'browser.open': (params) => openSite(params.url, params.fromPage),
  'tasks.output': (params) => taskOutput(params.sessionId, params.path),
  'push.subscribe': (params) => {
    subscribe(params)
    return null
  },
  'push.unsubscribe': (params) => {
    unsubscribe(params.endpoint)
    return null
  },
  'notifications.presence': (params, client) => {
    client.activeAt = params.active ? Date.now() : 0
    return null
  },
  'notices.here': (params) => {
    receiveAnswer(params.id, params.here)
    return null
  },
  'notices.act': async (params, client) => {
    await act(client, params.id, params.action)
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

export function connectClient(
  socket: WebSocket,
  device: string | null,
  address: string
) {
  const client: Client = {
    socket,
    device,
    address,
    activeAt: 0,
    opening: null,
    sessionId: null,
    send: (message) => socket.send(JSON.stringify(message)),
  }
  clients.add(client)
  log.info(`a browser connected from ${address}`)
  client.send({ type: 'welcome', snapshot: syncSnapshot() })
  const alive = setInterval(
    () => client.send({ type: 'alive' }),
    ALIVE_INTERVAL
  )
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      terminalInput(client, data as Buffer)
      return
    }
    void answer(client, String(data))
  })
  socket.on('error', (error) =>
    log.warn(`a browser connection from ${address} failed:`, error)
  )
  socket.on('close', (code) => {
    log.info(`a browser from ${address} disconnected (code ${code})`)
    clearInterval(alive)
    clients.delete(client)
    detachTerminal(client)
  })
  return client
}

async function answer(client: Client, text: string) {
  let call: RpcCall
  try {
    call = JSON.parse(text) as RpcCall
  } catch (error) {
    log.warn(
      `ignoring a message from ${client.address} that is not JSON:`,
      error
    )
    return
  }
  const started = performance.now()
  try {
    if (!Object.hasOwn(handlers, call.method)) {
      throw new Error(`unknown method ${call.method}`)
    }
    const handler = handlers[call.method] as (
      params: unknown,
      client: Client
    ) => unknown
    const result = await handler(call.params, client)
    if (call.known === undefined) {
      client.send({ type: 'reply', id: call.id, result })
      return
    }
    const hash = createHash('sha1')
      .update(JSON.stringify(result))
      .digest('base64')
    if (hash === call.known) {
      client.send({ type: 'reply', id: call.id, unchanged: true })
    } else {
      client.send({ type: 'reply', id: call.id, result, hash })
    }
  } catch (error) {
    log.warn(`${call.method} from ${client.address} failed:`, error)
    client.send({
      type: 'reply',
      id: call.id,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    const took = Math.round(performance.now() - started)
    log.debug(`${call.method} from ${client.address} took ${took}ms`)
  }
}
