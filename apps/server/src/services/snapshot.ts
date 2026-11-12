import os from 'node:os'
import type { SyncSnapshot } from '@offsite/core/protocol'
import { activity } from '../lib/live.ts'
import { configInfo } from '../storage/config.ts'
import {
  readLastEfforts,
  readLastModels,
  readLastSent,
} from '../storage/interactions.ts'
import { readAppIcon } from '../storage/state.ts'
import { readBookmarks } from './bookmarks.ts'
import { outboxPrompts } from './outbox.ts'
import { projects } from './projects.ts'
import { serviceState } from './service/update.ts'
import { providerStatuses, refreshAll, sessions } from './sessions.ts'
import { terminalTabs } from './terminal/terminal.ts'

export function syncSnapshot(): SyncSnapshot {
  refreshAll()
  return {
    ...configInfo(),
    lastUsed: readLastModels(),
    lastSent: readLastSent(),
    lastEfforts: readLastEfforts(),
    hostname: os.hostname(),
    projects: projects(),
    sessions: sessions(),
    outbox: outboxPrompts(),
    providers: providerStatuses(),
    activity: activity(),
    terminals: terminalTabs(),
    appIcon: readAppIcon(),
    bookmarks: readBookmarks(),
    service: serviceState(),
  }
}
