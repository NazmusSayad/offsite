import {
  matchFields,
  type FieldsMatch,
  searchWords,
  WHOLE_TITLE_BONUS,
  WHOLE_WORD,
} from '@offsite/core/search-match'
import type { Session } from './sessions.ts'

export type SessionPick = { query: string; at: number }

export type SessionOpens = {
  score: number
  openedAt: number
  picks: SessionPick[]
}

export type SearchSession = Session & { opens: SessionOpens | null }

export type SearchMessage = { author: 'user' | 'assistant'; text: string }

export type MessageMatch = {
  sessionId: string
  author: 'user' | 'assistant'
  quality: number
  snippet: string
}

export type ThreadSubject = {
  id: string
  title: string
  branch: string | null
  projectName: string | null
  machineName: string | null
  updatedAt: number
  opens: SessionOpens | null
}

const REFERENCE_QUALITY = 0.6
const CONTEXT_WEIGHT = 0.25
const BRANCH_WEIGHT = 0.6
const REFERENCE_LENGTH = 8
const PICK_PREFIX_LENGTH = 3
const OPEN_REPEAT = 10 * 60 * 1000
const PICK_WINDOW = 21 * 24 * 60 * 60 * 1000
const PICK_LIMIT = 3
const PICK_LENGTH = 32
const USAGE_HALF_LIFE = 14 * 24 * 60 * 60 * 1000
const USAGE_LIMIT = 2.5

function decay(age: number) {
  return 2 ** (-Math.max(0, age) / USAGE_HALF_LIFE)
}

function usageBoost(subject: ThreadSubject, now: number) {
  const recency = decay(now - subject.updatedAt)
  const opens =
    subject.opens === null
      ? 0
      : subject.opens.score * decay(now - subject.opens.openedAt)
  return Math.min(USAGE_LIMIT, 1 + recency + 0.5 * Math.log2(1 + opens))
}

function storedQuery(query: string) {
  return searchWords(query).join(' ').slice(0, PICK_LENGTH).trim()
}

function pickedAt(subject: ThreadSubject, query: string, now: number) {
  const stored = storedQuery(query)
  const picks = (subject.opens?.picks ?? []).filter(
    (pick) =>
      now - pick.at <= PICK_WINDOW &&
      (pick.query === stored ||
        (stored.length >= PICK_PREFIX_LENGTH && pick.query.startsWith(stored)))
  )
  return Math.max(0, ...picks.map((pick) => pick.at))
}

export function nextOpens(
  previous: SessionOpens | null,
  at: number,
  query: string | null
): SessionOpens {
  const pick = storedQuery(query ?? '')
  const earlier = (previous?.picks ?? []).filter(
    (entry) => at - entry.at <= PICK_WINDOW && entry.query !== pick
  )
  const picks = pick === '' ? earlier : [{ query: pick, at }, ...earlier]
  const kept = picks.slice(0, PICK_LIMIT)
  if (previous === null) {
    return { score: 1, openedAt: at, picks: kept }
  }
  if (at - previous.openedAt < OPEN_REPEAT) {
    return { ...previous, picks: kept }
  }
  return {
    score: previous.score * decay(at - previous.openedAt) + 1,
    openedAt: at,
    picks: kept,
  }
}

function matchThread(
  subject: ThreadSubject,
  query: string,
  typos: boolean
): FieldsMatch | null {
  const fields = [
    { value: subject.title, weight: 1, midWord: true },
    { value: subject.branch ?? '', weight: BRANCH_WEIGHT, midWord: false },
    {
      value: subject.projectName ?? '',
      weight: CONTEXT_WEIGHT,
      midWord: false,
    },
    {
      value: subject.machineName ?? '',
      weight: CONTEXT_WEIGHT,
      midWord: false,
    },
  ]
  const match = matchFields(query, fields, typos)
  if (match !== null) {
    return match
  }
  const reference = query.trim().toLowerCase()
  return reference.length >= REFERENCE_LENGTH &&
    subject.id.toLowerCase().includes(reference)
    ? { quality: REFERENCE_QUALITY, strong: true, ranges: [] }
    : null
}

function matchClass(quality: number) {
  if (quality >= WHOLE_WORD + WHOLE_TITLE_BONUS) {
    return 3
  }
  if (quality >= 0.7) {
    return 2
  }
  if (quality >= 0.4) {
    return 1
  }
  return 0
}

export function rankThreads<T>(
  items: T[],
  subjectOf: (item: T) => ThreadSubject,
  query: string,
  now: number
) {
  function rank(typos: boolean) {
    return items.flatMap((item) => {
      const subject = subjectOf(item)
      const match = matchThread(subject, query, typos)
      return match === null
        ? []
        : [
            {
              item,
              match,
              picked: pickedAt(subject, query, now),
              score: match.quality * usageBoost(subject, now),
            },
          ]
    })
  }
  const exact = rank(false)
  const found = exact.some((entry) => entry.match.strong) ? exact : rank(true)
  return [...found]
    .sort(
      (left, right) =>
        matchClass(right.match.quality) - matchClass(left.match.quality) ||
        right.picked - left.picked ||
        right.score - left.score
    )
    .map((entry) => ({ item: entry.item, ranges: entry.match.ranges }))
}

export function recentUse(subject: ThreadSubject) {
  return Math.max(subject.updatedAt, subject.opens?.openedAt ?? 0)
}

export function matchAction(query: string, label: string, detail: string) {
  return matchFields(
    query,
    [
      { value: label, weight: 1, midWord: true },
      { value: detail, weight: BRANCH_WEIGHT, midWord: false },
    ],
    false
  )
}

export function rankMessages<T extends MessageMatch>(
  matches: T[],
  subjectOf: (match: T) => ThreadSubject | undefined,
  query: string,
  now: number
) {
  return matches
    .flatMap((match) => {
      const subject = subjectOf(match)
      return subject === undefined ? [] : [{ match, subject }]
    })
    .sort(
      (left, right) =>
        compareMessages(left.match, right.match) ||
        pickedAt(right.subject, query, now) -
          pickedAt(left.subject, query, now) ||
        usageBoost(right.subject, now) - usageBoost(left.subject, now)
    )
    .map((entry) => entry.match)
}

export function compareMessages(
  left: Pick<MessageMatch, 'quality' | 'author'>,
  right: Pick<MessageMatch, 'quality' | 'author'>
) {
  return (
    right.quality - left.quality ||
    Number(right.author === 'user') - Number(left.author === 'user')
  )
}
