import { integer, snakeCase, text } from 'drizzle-orm/sqlite-core'

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
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  machine: text().notNull(),
  server: text().notNull(),
})
