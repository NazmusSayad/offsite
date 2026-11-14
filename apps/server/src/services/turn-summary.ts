import path from 'node:path'
import type { Item } from '@offsite/core/items'
import { diffLines } from 'diff'
import { sessionHistory } from './runs.ts'

const IMAGE = /!\[[^\]]*\]\((<[^>]+>|[^)\s]+)\)/g

export async function turnSummary(sessionId: string, cwd: string) {
  const event = await sessionHistory(sessionId, cwd)
  if (event.type !== 'history') {
    throw new Error(`expected the history of ${sessionId}, got ${event.type}`)
  }
  const items = event.items.filter((item) => item.parent === null)
  const start = items.findLastIndex(
    (item) => item.kind === 'user' && item.format === 'text'
  )
  const prompt = start === -1 ? null : items[start]
  const turn = items.slice(start + 1)
  const replies = turn.flatMap((item) =>
    item.kind === 'assistant' ? [item.text] : []
  )
  const changes = turn.flatMap((item) =>
    item.kind === 'file_change' ? [item] : []
  )
  return {
    request: prompt !== null && prompt.kind === 'user' ? prompt.text : '',
    reply: replies.at(-1) ?? '',
    startedAt: prompt === null ? null : prompt.time,
    files: new Set(changes.map((item) => item.path)).size,
    lines: lineStats(changes),
    images: replies.flatMap((text) => sharedImages(text, cwd)),
  }
}

export function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(IMAGE, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function duration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function lineStats(changes: Extract<Item, { kind: 'file_change' }>[]) {
  let added = 0
  let removed = 0
  for (const change of changes) {
    for (const diff of change.diffs) {
      for (const part of diffLines(diff.before, diff.after)) {
        if (part.added) {
          added += part.count
        }
        if (part.removed) {
          removed += part.count
        }
      }
    }
  }
  return { added, removed }
}

function sharedImages(text: string, cwd: string) {
  return [...text.matchAll(IMAGE)].flatMap((match) => {
    const target = match[1].replace(/^<(.*)>$/, '$1')
    if (target.startsWith('./')) {
      return [path.resolve(cwd, target)]
    }
    if (
      (target.startsWith('/') && !target.startsWith('//')) ||
      /^[a-z]:\//i.test(target)
    ) {
      return [target]
    }
    return []
  })
}
