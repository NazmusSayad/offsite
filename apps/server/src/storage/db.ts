import { chmodSync, closeSync, openSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { serverDir } from '../args.ts'
import { home } from './storage.ts'

const file = path.join(home, 'offsite.db')
closeSync(openSync(file, 'a', 0o600))
chmodSync(file, 0o600)

const client = new DatabaseSync(file)
client.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`)

export const db = drizzle({ client })

migrate(db, { migrationsFolder: path.join(serverDir, 'drizzle') })
