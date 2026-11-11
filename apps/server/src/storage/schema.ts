import type { RpcMethods } from '@offsite/core/protocol'
import type { SessionPick } from '@offsite/core/search'
import { integer, real, snakeCase, text } from 'drizzle-orm/sqlite-core'

export const projects = snakeCase.table('projects', {
  id: text().primaryKey(),
  path: text().notNull().unique(),
  name: text().notNull(),
  logo: text(),
  position: integer().notNull().default(0),
  pinned: integer({ mode: 'boolean' }).notNull().default(false),
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

export const interactions = snakeCase.table('interactions', {
  id: integer().primaryKey({ autoIncrement: true }),
  provider: text({ enum: ['claude', 'codex', 'opencode'] }).notNull(),
  account: text(),
  model: text(),
  effort: text(),
  project: text().notNull(),
  projectWorktree: text(),
  projectSession: text().notNull(),
  createdAt: integer().notNull(),
})

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
