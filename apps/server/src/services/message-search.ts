import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type { Provider } from '@offsite/core/providers'
import {
  compareMessages,
  type MessageMatch,
  type SearchMessage,
} from '@offsite/core/search'
import {
  hasSearchableWord,
  matchMessage,
  messageSnippet,
  SEARCH_WORD_LENGTH,
  searchWords,
} from '@offsite/core/search-match'
import { toMessage } from '../lib/claude/content.ts'
import { codexMessages, codexSearch } from '../lib/codex/index.ts'
import { openCodeMessages } from '../lib/opencode/index.ts'
import { claudeBaseDir, readConfig } from '../storage/config.ts'
import { providerName } from './accounts.ts'
import { projects } from './projects.ts'
import { find, type Found, timeLimit } from './provider-sessions.ts'

const READ_LIMIT = 30
const CODEX_READ_LIMIT = 10

const generatedText =
  /^(?:This session is being continued from a previous conversation|<command-|<local-command-)/

const run = promisify(execFile)

export async function searchMessages(query: string) {
  if (!hasSearchableWord(query)) {
    return { matches: [], failed: [] }
  }
  const paths = new Map(
    projects().map((project): [string, string] => [project.path, project.id])
  )
  const folders = new Map(
    projects().map((project) => [project.id, project.path])
  )
  const allProviders: Provider[] = ['claude', 'codex', 'opencode']
  const results = await Promise.all(
    allProviders
      .filter((provider) => readConfig().enabledProviders[provider])
      .map(async (provider) => {
        try {
          const matches = await timeLimit(
            search(provider, query, paths, folders),
            `${providerName(provider)} did not search in time`
          )
          return { provider, matches, failed: false }
        } catch (error) {
          console.warn(
            `could not search ${providerName(provider)} messages: ${error}`
          )
          return { provider, matches: [], failed: true }
        }
      })
  )
  return {
    matches: results.flatMap((result) => result.matches),
    failed: results
      .filter((result) => result.failed)
      .map((result) => result.provider),
  }
}

async function search(
  provider: Provider,
  query: string,
  paths: Map<string, string>,
  folders: Map<string, string>
) {
  const found = await find(provider, paths)
  if (found === null) {
    return []
  }
  const sessions = newestFirst(found)
  switch (provider) {
    case 'claude':
      return searchClaude(query, sessions, folders)
    case 'codex':
      return searchCodex(query, sessions)
    case 'opencode':
      return readAndMatch(
        query,
        sessions.slice(0, READ_LIMIT),
        openCodeMessages
      )
  }
}

function newestFirst(sessions: Found[]) {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function searchClaude(
  query: string,
  sessions: Found[],
  folders: Map<string, string>
) {
  const candidates = await claudeCandidates(query)
  const matching =
    candidates === null
      ? sessions
      : sessions.filter((session) => candidates.has(session.id))
  const projectOf = new Map(
    sessions.map((session) => [session.id, session.projectId])
  )
  return readAndMatch(query, matching.slice(0, READ_LIMIT), (sessionId) =>
    claudeMessages(sessionId, folders.get(projectOf.get(sessionId) ?? ''))
  )
}

async function claudeMessages(
  sessionId: string,
  dir: string | undefined
): Promise<SearchMessage[]> {
  const messages = await getSessionMessages(sessionId, { dir })
  return messages.flatMap((item) => {
    if (item.type === 'system' || item.parent_tool_use_id !== null) {
      return []
    }
    const text = toMessage(item.type, item, null)
      .content.flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
    return generatedText.test(text) ? [] : [{ author: item.type, text }]
  })
}

async function claudeCandidates(query: string) {
  const words = searchWords(query).filter(
    (word) => word.length >= SEARCH_WORD_LENGTH && !/["\\]/.test(word)
  )
  if (words.length === 0) {
    return null
  }
  try {
    const lists = await Promise.all(words.map((word) => sessionsWith(word)))
    return new Set(
      lists[0].filter((id) => lists.every((list) => list.includes(id)))
    )
  } catch (error) {
    console.warn(`could not narrow Claude sessions with rg: ${error}`)
    return null
  }
}

async function sessionsWith(word: string) {
  const output = await run(
    'rg',
    [
      '--files-with-matches',
      '--fixed-strings',
      '--ignore-case',
      '--no-ignore',
      '--hidden',
      '--max-depth',
      '2',
      '--glob',
      '*.jsonl',
      '--',
      word,
      path.join(claudeBaseDir(), 'projects'),
    ],
    { maxBuffer: 16 * 1024 * 1024 }
  ).catch((error: { code?: number | string }) => {
    if (error.code === 1) {
      return { stdout: '' }
    }
    throw error
  })
  return output.stdout
    .split('\n')
    .filter(Boolean)
    .map((file) => path.basename(file, '.jsonl'))
}

async function searchCodex(query: string, sessions: Found[]) {
  const longest = [...searchWords(query)].sort((a, b) => b.length - a.length)[0]
  const known = new Map(sessions.map((session) => [session.id, session]))
  const found = (await codexSearch(longest))
    .filter((result) => known.has(result.thread.id))
    .sort((a, b) => b.thread.updatedAt - a.thread.updatedAt)
  const read = found.slice(0, CODEX_READ_LIMIT)
  const verified = await readAndMatch(
    query,
    read.map((result) => ({ id: result.thread.id })),
    codexMessages
  )
  const unverified = found.slice(CODEX_READ_LIMIT).flatMap((result) => {
    const match = matchMessage(query, result.snippet)
    return match === null
      ? []
      : [
          {
            sessionId: result.thread.id,
            author: 'assistant' as const,
            quality: match.quality,
            snippet: messageSnippet(result.snippet, match.offset),
          },
        ]
  })
  return [...verified, ...unverified]
}

async function readAndMatch(
  query: string,
  sessions: { id: string }[],
  read: (sessionId: string) => Promise<SearchMessage[]>
) {
  const matches = await Promise.all(
    sessions.map(async (session) =>
      bestMatch(query, session.id, await read(session.id))
    )
  )
  return matches.filter((match) => match !== null)
}

function bestMatch(
  query: string,
  sessionId: string,
  messages: SearchMessage[]
) {
  let best: MessageMatch | null = null
  for (const message of messages) {
    const match = matchMessage(query, message.text)
    if (match === null) {
      continue
    }
    const candidate = {
      sessionId,
      author: message.author,
      quality: match.quality,
      snippet: messageSnippet(message.text, match.offset),
    }
    if (best === null || compareMessages(candidate, best) < 0) {
      best = candidate
    }
  }
  return best
}
