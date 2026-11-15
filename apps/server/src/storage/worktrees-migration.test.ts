import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migrations = path.join(import.meta.dirname, '..', '..', 'drizzle')
const WORKTREES = '20261114172450_worktrees'

let folder: string
let client: DatabaseSync

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'offsite-migration-'))
  const before = path.join(folder, 'before')
  for (const name of readdirSync(migrations)) {
    if (name < WORKTREES) {
      cpSync(path.join(migrations, name), path.join(before, name), {
        recursive: true,
      })
    }
  }
  client = new DatabaseSync(path.join(folder, 'offsite.db'))
  client.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client }), { migrationsFolder: before })
  client.exec(`
    INSERT INTO projects (id, path, name, parent_id, worktree_branch, worktree_setup, pinned) VALUES
      ('root', '/repo', 'repo', NULL, NULL, 'pnpm install', 1),
      ('wt1', '/repo-wt1', 'wt1', 'root', 'feature', NULL, 0),
      ('wt2', '/repo-wt2/app/', 'wt2', 'root', NULL, NULL, 0),
      ('other', '/other', 'other', NULL, NULL, NULL, 0);
    INSERT INTO session_places (session_id, project_id, claude_worktree) VALUES
      ('in-root', 'root', 0),
      ('in-wt1', 'wt1', 0),
      ('in-wt2', 'wt2', 1),
      ('in-other', 'other', 0);
    INSERT INTO outbox (id, session_id, project_id, request, status, created_at) VALUES
      ('new-chat', NULL, 'wt1', '{}', 'failed', 1),
      ('queued', 'in-wt1', 'wt1', '{}', 'queued', 2),
      ('main', 'in-root', 'root', '{}', 'failed', 3);
  `)
  migrate(drizzle({ client }), { migrationsFolder: migrations })
})

afterEach(() => {
  client.close()
  rmSync(folder, { recursive: true, force: true })
})

function rows(sql: string) {
  return client.prepare(sql).all()
}

describe('worktrees migration', () => {
  it('keeps only real projects as projects', () => {
    expect(
      rows('SELECT id, path, worktree_setup, pinned FROM projects ORDER BY id')
    ).toEqual([
      { id: 'other', path: '/other', worktree_setup: null, pinned: 0 },
      { id: 'root', path: '/repo', worktree_setup: 'pnpm install', pinned: 1 },
    ])
  })

  it('moves worktree projects into worktrees with the same ids', () => {
    expect(rows('SELECT * FROM worktrees ORDER BY id')).toEqual([
      { id: 'wt1', project_id: 'root', path: '/repo-wt1', branch: 'feature' },
      { id: 'wt2', project_id: 'root', path: '/repo-wt2/app', branch: null },
    ])
  })

  it('places chats in their project and worktree', () => {
    expect(
      rows(
        'SELECT session_id, project_id, worktree_id FROM session_places ORDER BY session_id'
      )
    ).toEqual([
      {
        session_id: 'in-other',
        project_id: 'other',
        worktree_id: null,
      },
      {
        session_id: 'in-root',
        project_id: 'root',
        worktree_id: null,
      },
      {
        session_id: 'in-wt1',
        project_id: 'root',
        worktree_id: 'wt1',
      },
      {
        session_id: 'in-wt2',
        project_id: 'root',
        worktree_id: 'wt2',
      },
    ])
  })

  it('places unsent messages in their project and worktree', () => {
    expect(
      rows(
        'SELECT id, session_id, project_id, worktree_id, status FROM outbox ORDER BY id'
      )
    ).toEqual([
      {
        id: 'main',
        session_id: 'in-root',
        project_id: 'root',
        worktree_id: null,
        status: 'failed',
      },
      {
        id: 'new-chat',
        session_id: null,
        project_id: 'root',
        worktree_id: 'wt1',
        status: 'failed',
      },
      {
        id: 'queued',
        session_id: 'in-wt1',
        project_id: 'root',
        worktree_id: 'wt1',
        status: 'queued',
      },
    ])
  })

  it('leaves no broken references', () => {
    expect(rows('PRAGMA foreign_key_check')).toEqual([])
  })

  it('removes worktrees and their chat places with their project', () => {
    client.exec("DELETE FROM projects WHERE id = 'root'")
    expect(rows('SELECT id FROM worktrees')).toEqual([])
    expect(
      rows('SELECT session_id FROM session_places ORDER BY session_id')
    ).toEqual([{ session_id: 'in-other' }, { session_id: 'in-root' }])
  })
})
