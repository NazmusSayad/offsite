import type { ImageAttachment } from '@offsite/core/items'
import type { RpcMethods } from '@offsite/core/protocol'
import type { ReviewGuide } from '@offsite/core/pull-requests'
import type { SessionPick } from '@offsite/core/search'
import { blob, integer, real, snakeCase, text } from 'drizzle-orm/sqlite-core'

export const projects = snakeCase.table('projects', {
  id: text().primaryKey(),
  path: text().notNull().unique(),
  name: text().notNull(),
  logo: text(),
  position: integer().notNull().default(0),
  pinned: integer({ mode: 'boolean' }).notNull().default(false),
  hidden: integer({ mode: 'boolean' }).notNull().default(false),
  scratch: integer({ mode: 'boolean' }).notNull().default(false),
  worktreeSetup: text(),
  startInWorktree: integer({ mode: 'boolean' }).notNull().default(false),
})

export const worktrees = snakeCase.table('worktrees', {
  id: text().primaryKey(),
  projectId: text()
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  path: text().notNull().unique(),
  branch: text(),
})

export const sessions = snakeCase.table('sessions', {
  sessionId: text().primaryKey(),
  provider: text({ enum: ['claude', 'codex', 'opencode'] }),
  interactedAt: integer(),
  status: text({
    enum: ['active', 'pinned', 'snoozed', 'minimized'],
  }).notNull(),
  unread: integer({ mode: 'boolean' }).notNull().default(false),
})

export const sessionPlaces = snakeCase.table('session_places', {
  sessionId: text().primaryKey(),
  projectId: text().notNull(),
  worktreeId: text().references(() => worktrees.id, { onDelete: 'cascade' }),
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

export const connections = snakeCase.table('connections', {
  address: text().primaryKey(),
  addresses: text({ mode: 'json' }).$type<string[]>().notNull(),
  name: text(),
  key: text().notNull(),
  createdAt: integer().notNull(),
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

export const sideQuests = snakeCase.table('side_quests', {
  id: text().primaryKey(),
  sessionId: text().notNull(),
  question: text().notNull(),
  images: text({ mode: 'json' })
    .$type<ImageAttachment[]>()
    .notNull()
    .default([]),
  answer: text(),
  status: text({ enum: ['answering', 'answered', 'failed'] }).notNull(),
  error: text(),
  createdAt: integer().notNull(),
})

export const reviewGuides = snakeCase.table('review_guides', {
  id: text().primaryKey(),
  url: text().notNull(),
  guide: text({ mode: 'json' }).$type<ReviewGuide>().notNull(),
})

export const outbox = snakeCase.table('outbox', {
  id: text().primaryKey(),
  sessionId: text(),
  projectId: text().notNull(),
  worktreeId: text(),
  request: text({ mode: 'json' })
    .$type<RpcMethods['sessions.send']['params']>()
    .notNull(),
  status: text({ enum: ['sending', 'accepted', 'queued', 'failed'] }).notNull(),
  sessionStatus: text({
    enum: ['active', 'pinned', 'snoozed', 'minimized', 'inactive'],
  }),
  createdAt: integer().notNull(),
})

export const generations = snakeCase.table('generations', {
  id: integer().primaryKey({ autoIncrement: true }),
  task: text({
    enum: [
      'session-title',
      'branch-name',
      'notification-summary',
      'review-guide',
      'pull-request',
      'commit-message',
      'finished-check',
    ],
  }).notNull(),
  provider: text({
    enum: ['claude', 'codex', 'opencode', 'openrouter'],
  }).notNull(),
  account: text(),
  model: text().notNull(),
  instructions: text().notNull(),
  input: text().notNull(),
  output: text(),
  status: text({ enum: ['succeeded', 'failed'] }).notNull(),
  error: text(),
  durationMs: integer().notNull(),
  createdAt: integer().notNull(),
  sessionId: text(),
  projectId: text(),
  worktreeId: text(),
  itemId: text(),
  taskIds: text({ mode: 'json' }).$type<string[]>(),
})

export const notificationIcons = snakeCase.table('notification_icons', {
  key: text().primaryKey(),
  projectId: text().references(() => projects.id, { onDelete: 'cascade' }),
  image: blob({ mode: 'buffer' }).notNull(),
})
