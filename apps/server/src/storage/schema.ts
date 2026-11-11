import type { RpcMethods } from '@offsite/core/protocol'
import type { SessionPick } from '@offsite/core/search'
import {
  integer,
  primaryKey,
  real,
  snakeCase,
  text,
} from 'drizzle-orm/sqlite-core'

export const projects = snakeCase.table('projects', {
  id: text().primaryKey(),
  path: text().notNull().unique(),
  name: text().notNull(),
  logo: text(),
  position: integer().notNull().default(0),
  hidden: integer({ mode: 'boolean' }).notNull().default(false),
  scratch: integer({ mode: 'boolean' }).notNull().default(false),
  parentId: text(),
  worktreeSetup: text(),
  worktreeBranch: text(),
})

export const sessions = snakeCase.table('sessions', {
  sessionId: text().primaryKey(),
  provider: text({ enum: ['claude', 'codex', 'opencode'] }),
  interactedAt: integer(),
  status: text({
    enum: ['active', 'pinned', 'snoozed', 'minimized'],
  }).notNull(),
})

export const sessionPlaces = snakeCase.table('session_places', {
  sessionId: text().primaryKey(),
  projectId: text().notNull(),
  claudeWorktree: integer({ mode: 'boolean' }).notNull().default(false),
})

export const sessionOpens = snakeCase.table('session_opens', {
  sessionId: text().primaryKey(),
  score: real().notNull(),
  openedAt: integer().notNull(),
  picks: text({ mode: 'json' }).$type<SessionPick[]>().notNull(),
})

export const pairingCodes = snakeCase.table('pairing_codes', {
  hash: text().primaryKey(),
  name: text(),
  expiresAt: integer().notNull(),
})

export const devices = snakeCase.table('devices', {
  hash: text().primaryKey(),
  name: text(),
  createdAt: integer().notNull(),
  expiresAt: integer().notNull(),
  lastUsedAt: integer(),
})

export const pushSubscriptions = snakeCase.table('push_subscriptions', {
  endpoint: text().primaryKey(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  machine: text().notNull(),
  server: text().notNull(),
})

export const lastPickedModels = snakeCase.table('last_used_models', {
  provider: text({ enum: ['claude', 'codex', 'opencode'] }).primaryKey(),
  accountId: text(),
  model: text().notNull(),
  usedAt: integer().notNull(),
})

export const lastMessageTimes = snakeCase.table('last_sent', {
  accountId: text().primaryKey(),
  sentAt: integer().notNull(),
})

export const lastPickedEfforts = snakeCase.table(
  'last_efforts',
  {
    provider: text({ enum: ['claude', 'codex', 'opencode'] }).notNull(),
    model: text().notNull(),
    effort: text(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.model] })]
)

export const bookmarks = snakeCase.table('bookmarks', {
  id: text().primaryKey(),
  sessionId: text().notNull(),
  itemId: text(),
  start: integer(),
  end: integer(),
  createdAt: integer().notNull(),
})

export const unsentPrompts = snakeCase.table('unsent_prompts', {
  id: text().primaryKey(),
  sessionId: text(),
  projectId: text().notNull(),
  request: text({ mode: 'json' })
    .$type<RpcMethods['sessions.send']['params']>()
    .notNull(),
  status: text({ enum: ['sending', 'queued', 'failed'] }).notNull(),
  createdAt: integer().notNull(),
})
