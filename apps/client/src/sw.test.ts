import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { expect, it, vi } from 'vitest'

it('saves every built file for offline use', async () => {
  const root = path.join(import.meta.dirname, '..')
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'offsite-sw-'))
  vi.stubEnv('NODE_ENV', 'production')
  try {
    await build({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    })
    const built = readdirSync(outDir, { recursive: true, encoding: 'utf8' })
      .filter(
        (name) => name !== 'sw.js' && statSync(path.join(outDir, name)).isFile()
      )
      .map((name) => name.split(path.sep).join('/'))
      .sort()
    const worker = readFileSync(path.join(outDir, 'sw.js'), 'utf8')
    const saved = [
      ...new Set(
        [...worker.matchAll(/"url":"([^"]+)"/g)].map((match) => match[1])
      ),
    ].sort()
    expect(built).toContain('index.html')
    expect(saved).toEqual(built)
  } finally {
    vi.unstubAllEnvs()
    rmSync(outDir, { recursive: true, force: true })
  }
}, 600_000)
