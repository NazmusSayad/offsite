import { integer, snakeCase, text } from 'drizzle-orm/sqlite-core'

export const machine = snakeCase.table('machine', {
  id: text().primaryKey(),
  pushPublicKey: text().notNull(),
  pushPrivateKey: text().notNull(),
})

export const projects = snakeCase.table('projects', {
  id: text().primaryKey(),
  path: text().notNull().unique(),
  name: text().notNull(),
  logo: text(),
})

export const sessions = snakeCase.table('sessions', {
  sessionId: text().primaryKey(),
  interactedAt: integer(),
  status: text({ enum: ['active', 'pinned', 'minimized'] }).notNull(),
})

export const tokens = snakeCase.table('tokens', {
  hash: text().primaryKey(),
  name: text(),
  createdAt: integer().notNull(),
  lastUsedAt: integer(),
})

export const pushSubscriptions = snakeCase.table('push_subscriptions', {
  endpoint: text().primaryKey(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  server: text().notNull(),
})
