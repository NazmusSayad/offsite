import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { loadGhostty } from './runtime'

export async function loadTestGhostty() {
  const bytes = readFileSync(`${import.meta.dirname}/ghostty-vt.wasm`)
  vi.stubGlobal('fetch', () =>
    Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes) })
  )
  await loadGhostty()
  vi.unstubAllGlobals()
}
