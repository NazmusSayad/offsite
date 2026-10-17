import { randomUUID } from 'node:crypto'
import { chmodSync, closeSync, openSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import webPush from 'web-push'
import { serverDir } from '../args.ts'
import { machine } from './schema.ts'
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

db.transaction(
  (tx) => {
    if (tx.select().from(machine).get() !== undefined) return
    const keys = webPush.generateVAPIDKeys()
    tx.insert(machine)
      .values({
        id: randomUUID(),
        pushPublicKey: keys.publicKey,
        pushPrivateKey: keys.privateKey,
      })
      .run()
  },
  { behavior: 'immediate' }
)

export function machineInfo() {
  const row = db.select().from(machine).get()
  if (row === undefined) throw new Error('the machine row is missing')
  return row
}
