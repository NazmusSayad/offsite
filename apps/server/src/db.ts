import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { home } from './storage.ts'

mkdirSync(home, { recursive: true })

export const db = new DatabaseSync(path.join(home, 'offsite.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo TEXT
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    session_id TEXT PRIMARY KEY,
    time INTEGER NOT NULL
  )
`)
