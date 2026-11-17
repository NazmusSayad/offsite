import { count, lt, sql } from 'drizzle-orm'
import { db } from '../../storage/db.ts'
import { generations, reviewGuides } from '../../storage/schema.ts'

const RECORD_AGE = 30 * 86_400_000

function oldGenerations(now: number) {
  return lt(generations.createdAt, now - RECORD_AGE)
}

function oldGuides(now: number) {
  return sql`json_extract(${reviewGuides.guide}, '$.createdAt') < ${now - RECORD_AGE}`
}

export function generationsItem(now: number) {
  const found = db
    .select({
      count: count(),
      bytes: sql<number>`coalesce(sum(length(cast(${generations.instructions} as blob)) + length(cast(${generations.input} as blob)) + coalesce(length(cast(${generations.output} as blob)), 0) + coalesce(length(cast(${generations.error} as blob)), 0)), 0)`,
    })
    .from(generations)
    .where(oldGenerations(now))
    .get()
  if (found === undefined || found.count === 0) {
    return null
  }
  return {
    id: 'generations',
    kind: 'generations' as const,
    count: found.count,
    bytes: found.bytes,
  }
}

export function reviewGuidesItem(now: number) {
  const found = db
    .select({
      count: count(),
      bytes: sql<number>`coalesce(sum(length(cast(${reviewGuides.guide} as blob))), 0)`,
    })
    .from(reviewGuides)
    .where(oldGuides(now))
    .get()
  if (found === undefined || found.count === 0) {
    return null
  }
  return {
    id: 'reviewGuides',
    kind: 'reviewGuides' as const,
    count: found.count,
    bytes: found.bytes,
  }
}

export function deleteGenerations(now: number) {
  db.delete(generations).where(oldGenerations(now)).run()
}

export function deleteReviewGuides(now: number) {
  db.delete(reviewGuides).where(oldGuides(now)).run()
}
