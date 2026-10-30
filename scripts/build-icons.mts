import { copyFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const apps = path.join(import.meta.dirname, '..', 'apps')
const source = path.join(apps, 'core', 'logo.svg')
const svg = readFileSync(source)

for (const app of ['client', 'web']) {
  copyFileSync(source, path.join(apps, app, 'public', 'icon.svg'))
}

for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(apps, 'client', 'public', file))
}
