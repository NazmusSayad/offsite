import { and, desc, eq, inArray, lte } from 'drizzle-orm'
import { db } from './db.ts'
import { connections, issuedKeys } from './schema.ts'

export function saveConnection(address: string, key: string) {
  const createdAt = Date.now()
  db.insert(connections)
    .values({ address, key, createdAt })
    .onConflictDoUpdate({
      target: connections.address,
      set: { key, createdAt },
    })
    .run()
}

export function readConnections() {
  return db.select().from(connections).orderBy(connections.createdAt).all()
}

export function removeConnection(address: string) {
  db.delete(connections).where(eq(connections.address, address)).run()
}

export function saveIssuedKey(key: typeof issuedKeys.$inferInsert) {
  db.insert(issuedKeys).values(key).run()
}

export function readIssuedKeys(address: string) {
  return db
    .select()
    .from(issuedKeys)
    .where(eq(issuedKeys.address, address))
    .all()
}

export function latestIssuedKey(browser: string, address: string) {
  return (
    db
      .select()
      .from(issuedKeys)
      .where(
        and(eq(issuedKeys.browser, browser), eq(issuedKeys.address, address))
      )
      .orderBy(desc(issuedKeys.expiresAt))
      .get() ?? null
  )
}

export function removeIssuedKeys(keys: string[]) {
  db.delete(issuedKeys).where(inArray(issuedKeys.key, keys)).run()
}

export function removeExpiredIssuedKeys() {
  db.delete(issuedKeys).where(lte(issuedKeys.expiresAt, Date.now())).run()
}
