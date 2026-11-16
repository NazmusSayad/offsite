import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import sharp from 'sharp'
import { logger } from '../lib/log.ts'

const log = logger.withTag('notice-images')

const WIDTH = 1024
const HEIGHT = 512
const GAP = 8
const TILES = 6
const KEEP = 24 * 60 * 60 * 1000
const LIMIT = 50
const PREFIX = '/api/notice-image/'
const imageFiles = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

const images = new Map<string, { at: number; png: Buffer }>()

export async function noticeImage(files: string[]) {
  const found = files.filter(
    (file) =>
      imageFiles.has(path.extname(file).toLowerCase()) &&
      statSync(file, { throwIfNoEntry: false })?.isFile() === true
  )
  if (found.length === 0) {
    return null
  }
  try {
    const png = await grid(found)
    const token = randomBytes(24).toString('base64url')
    for (const entry of images) {
      if (Date.now() - entry[1].at > KEEP || images.size >= LIMIT) {
        images.delete(entry[0])
      }
    }
    images.set(token, { at: Date.now(), png })
    return `${PREFIX}${token}`
  } catch (error) {
    log.warn('could not build the notification image:', error)
    return null
  }
}

export function serveNoticeImage(pathname: string, response: ServerResponse) {
  const image = images.get(pathname.slice(PREFIX.length))
  if (image === undefined) {
    response.statusCode = 404
    response.end('not found')
    return
  }
  response.setHeader('content-type', 'image/png')
  response.setHeader('cache-control', 'private, max-age=86400')
  response.setHeader('access-control-allow-origin', '*')
  response.end(image.png)
}

async function grid(files: string[]) {
  const cells = layout(Math.min(files.length, TILES))
  const extra = files.length - cells.length
  const tiles = await Promise.all(
    cells.map(async (cell, index) => {
      const width = Math.round(cell.width)
      const height = Math.round(cell.height)
      const tile = sharp(files[index]).resize(width, height, {
        fit: 'cover',
        position: 'top',
      })
      if (extra > 0 && index === cells.length - 1) {
        tile.composite([{ input: moreOverlay(extra + 1, width, height) }])
      }
      return {
        input: await tile.png().toBuffer(),
        left: Math.round(cell.left),
        top: Math.round(cell.top),
      }
    })
  )
  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#000' },
  })
    .composite(tiles)
    .png()
    .toBuffer()
}

function layout(count: number) {
  const half = (WIDTH - GAP) / 2
  const halfHeight = (HEIGHT - GAP) / 2
  const right = half + GAP
  const bottom = halfHeight + GAP
  if (count === 1) {
    return [{ left: 0, top: 0, width: WIDTH, height: HEIGHT }]
  }
  if (count === 2) {
    return [
      { left: 0, top: 0, width: half, height: HEIGHT },
      { left: right, top: 0, width: half, height: HEIGHT },
    ]
  }
  if (count === 3) {
    return [
      { left: 0, top: 0, width: half, height: HEIGHT },
      { left: right, top: 0, width: half, height: halfHeight },
      { left: right, top: bottom, width: half, height: halfHeight },
    ]
  }
  if (count === 4) {
    return [
      { left: 0, top: 0, width: half, height: halfHeight },
      { left: right, top: 0, width: half, height: halfHeight },
      { left: 0, top: bottom, width: half, height: halfHeight },
      { left: right, top: bottom, width: half, height: halfHeight },
    ]
  }
  const third = (WIDTH - 2 * GAP) / 3
  return [0, 1].flatMap((row) =>
    [0, 1, 2].map((column) => ({
      left: column * (third + GAP),
      top: row * bottom,
      width: third,
      height: halfHeight,
    }))
  )
}

function moreOverlay(count: number, width: number, height: number) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000" fill-opacity="0.6"/><text x="50%" y="50%" dy="20" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="600" fill="#fff">+${count}</text></svg>`
  )
}
