import { createHash, randomBytes } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { db } from './db.ts'
import { tokens } from './schema.ts'

export function readTokens() {
  return db.select().from(tokens).orderBy(tokens.createdAt).all()
}

export function addToken(name: string | null) {
  const token = randomBytes(32).toString('base64url')
  db.insert(tokens)
    .values({ hash: hashToken(token), name, createdAt: Date.now() })
    .run()
  return token
}

export function removeTokens(hashes: string[]) {
  db.delete(tokens).where(inArray(tokens.hash, hashes)).run()
}

export function hasTokens() {
  return db.select().from(tokens).limit(1).get() !== undefined
}

export function matchesToken(given: string | null) {
  if (given === null) return false
  return (
    db
      .select()
      .from(tokens)
      .where(eq(tokens.hash, hashToken(given)))
      .get() !== undefined
  )
}

export function recordUse(token: string) {
  db.update(tokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(tokens.hash, hashToken(token)))
    .run()
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
