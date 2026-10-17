import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, inArray, lte } from 'drizzle-orm'
import { db } from './db.ts'
import { devices, pairingCodes } from './schema.ts'

const CODE_LIFETIME = 5 * 60_000
const DEVICE_LIFETIME = 30 * 24 * 60 * 60_000

export function addCode(name: string | null) {
  const code = randomBytes(16).toString('base64url')
  db.delete(pairingCodes).where(lte(pairingCodes.expiresAt, Date.now())).run()
  db.insert(pairingCodes)
    .values({ hash: hash(code), name, expiresAt: Date.now() + CODE_LIFETIME })
    .run()
  return code
}

export function redeemCode(code: string) {
  const found = db
    .delete(pairingCodes)
    .where(eq(pairingCodes.hash, hash(code)))
    .returning()
    .get()
  if (found === undefined || found.expiresAt <= Date.now()) {
    return null
  }
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  db.insert(devices)
    .values({
      hash: hash(token),
      name: found.name,
      createdAt: now,
      expiresAt: now + DEVICE_LIFETIME,
    })
    .run()
  return token
}

export function findDevice(token: string) {
  const found = db
    .select()
    .from(devices)
    .where(
      and(eq(devices.hash, hash(token)), gt(devices.expiresAt, Date.now()))
    )
    .get()
  return found === undefined ? null : found.hash
}

export function isPaired(device: string) {
  return (
    db
      .select()
      .from(devices)
      .where(and(eq(devices.hash, device), gt(devices.expiresAt, Date.now())))
      .get() !== undefined
  )
}

export function hasDevices() {
  return (
    db
      .select()
      .from(devices)
      .where(gt(devices.expiresAt, Date.now()))
      .limit(1)
      .get() !== undefined
  )
}

export function readDevices() {
  return db.select().from(devices).orderBy(devices.createdAt).all()
}

export function removeDevices(hashes: string[]) {
  db.delete(devices).where(inArray(devices.hash, hashes)).run()
}

export function recordUse(device: string) {
  db.update(devices)
    .set({ lastUsedAt: Date.now() })
    .where(eq(devices.hash, device))
    .run()
}

function hash(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}
