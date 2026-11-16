import { eq } from 'drizzle-orm'
import { db } from './db.ts'
import { connections } from './schema.ts'

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
