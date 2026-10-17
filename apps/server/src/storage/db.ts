import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { home } from './storage.ts'

export const db = new DatabaseSync(path.join(home, 'offsite.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo TEXT
  )
`)

db.exec('DROP TABLE IF EXISTS prompts')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    interacted_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('active', 'pinned', 'minimized'))
  )
`)
