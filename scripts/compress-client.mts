import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dist = path.join(import.meta.dirname, '..', 'apps', 'client', 'dist')
const compressible = new Set(['.js', '.css', '.svg', '.json', '.wasm', '.ttf'])

for (const name of readdirSync(dist, { recursive: true, encoding: 'utf8' })) {
  if (!compressible.has(path.extname(name))) {
    continue
  }
  const file = path.join(dist, name)
  const content = readFileSync(file)
  writeFileSync(
    `${file}.br`,
    brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    })
  )
  writeFileSync(`${file}.gz`, gzipSync(content, { level: 9 }))
}
