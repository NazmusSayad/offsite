import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const output = path.join(import.meta.dirname, '..', 'apps', 'web', 'public')
const svg = readFileSync(path.join(output, 'icon.svg'))

for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(output, file))
}
