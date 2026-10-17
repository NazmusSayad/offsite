import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readJson, writeJson } from './storage.ts'

export type PairingToken = {
  token: string
  name: string | null
  createdAt: number
}

export function readTokens() {
  const stored = readJson('tokens.json') as { tokens: PairingToken[] } | null
  return stored === null ? [] : stored.tokens
}

export function addToken(name: string | null) {
  const token = randomBytes(32).toString('base64url')
  writeJson('tokens.json', {
    tokens: [...readTokens(), { token, name, createdAt: Date.now() }],
  })
  return token
}

export function removeTokens(tokens: string[]) {
  writeJson('tokens.json', {
    tokens: readTokens().filter((item) => !tokens.includes(item.token)),
  })
}

export function firstToken() {
  return readTokens().at(0)?.token ?? addToken(null)
}

export function matchesToken(given: string | null) {
  if (given === null) return false
  const actual = Buffer.from(given)
  return readTokens().some((item) => {
    const expected = Buffer.from(item.token)
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    )
  })
}

export function readUsage() {
  return (readJson('token-usage.json') ?? {}) as Record<string, number>
}

export function recordUse(token: string) {
  writeJson('token-usage.json', { ...readUsage(), [token]: Date.now() })
}
