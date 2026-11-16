import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migrations = path.join(import.meta.dirname, '..', '..', 'drizzle')
const FORWARD_KEYS = '20261116075044_forward_connection_keys'

let folder: string
let client: DatabaseSync

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'offsite-migration-'))
  const before = path.join(folder, 'before')
  for (const name of readdirSync(migrations)) {
    if (name < FORWARD_KEYS) {
      cpSync(path.join(migrations, name), path.join(before, name), {
        recursive: true,
      })
    }
  }
  client = new DatabaseSync(path.join(folder, 'offsite.db'))
  client.exec('PRAGMA foreign_keys = ON;')
  migrate(drizzle({ client }), { migrationsFolder: before })
  client.exec(`
    INSERT INTO devices (hash, name, created_at, expires_at, last_used_at, issued_by) VALUES
      ('hub', 'Mac', 1, 100, 5, NULL),
      ('through-hub', 'Phone through Mac', 2, 200, NULL, 'hub');
    INSERT INTO connections (address, key, created_at) VALUES
      ('http://windows.local:2020', 'windows-key', 3);
    INSERT INTO issued_keys (key, browser, address, expires_at) VALUES
      ('issued', 'phone', 'http://windows.local:2020', 300);
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

describe('forward connection keys migration', () => {
  it('keeps every paired browser and machine', () => {
    expect(
      rows(
        'SELECT hash, name, created_at, expires_at, last_used_at FROM devices ORDER BY hash'
      )
    ).toEqual([
      {
        hash: 'hub',
        name: 'Mac',
        created_at: 1,
        expires_at: 100,
        last_used_at: 5,
      },
      {
        hash: 'through-hub',
        name: 'Phone through Mac',
        created_at: 2,
        expires_at: 200,
        last_used_at: null,
      },
    ])
  })

  it('drops the link between keys, so removing one key keeps the others', () => {
    expect(
      rows('PRAGMA table_info(devices)').map(
        (column) => (column as { name: string }).name
      )
    ).not.toContain('issued_by')

    client.exec("DELETE FROM devices WHERE hash = 'hub'")

    expect(rows('SELECT hash FROM devices')).toEqual([{ hash: 'through-hub' }])
  })

  it('gives each connected machine its address as its only address and no name', () => {
    expect(rows('SELECT address, addresses, name FROM connections')).toEqual([
      {
        address: 'http://windows.local:2020',
        addresses: '["http://windows.local:2020"]',
        name: null,
      },
    ])
  })

  it('keeps connected machines and drops the per-browser keys', () => {
    expect(rows('SELECT address, key, created_at FROM connections')).toEqual([
      {
        address: 'http://windows.local:2020',
        key: 'windows-key',
        created_at: 3,
      },
    ])
    expect(
      rows("SELECT name FROM sqlite_master WHERE name = 'issued_keys'")
    ).toEqual([])
  })
})
