import { existsSync, readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { appIcons } from '@offsite/core/app-icons'
import sharp from 'sharp'
import { readAppIcon } from '../storage/state.ts'

const pngs = new Map([
  ['icon-192.png', { size: 192, maskable: false }],
  ['icon-512.png', { size: 512, maskable: false }],
  ['icon-maskable-512.png', { size: 512, maskable: true }],
])

export async function serveAppIcon(
  publicDir: string,
  pathname: string,
  response: ServerResponse
) {
  const logoPath = path.join(publicDir, 'icon.svg')
  if (!existsSync(logoPath)) {
    response.statusCode = 404
    response.end('web app not built; run pnpm build')
    return
  }
  try {
    const icon = await renderAppIcon(
      readFileSync(logoPath, 'utf8'),
      pathname.slice('/api/app-icon/'.length)
    )
    if (icon === null) {
      response.statusCode = 404
      response.end('not found')
      return
    }
    response.setHeader('content-type', icon.type)
    response.setHeader('cache-control', 'no-cache')
    response.end(icon.body)
  } catch (error) {
    console.warn(`could not serve the app icon: ${error}`)
    response.statusCode = 500
    response.end('could not render the app icon')
  }
}

async function renderAppIcon(logo: string, file: string) {
  if (file === 'icon.svg') {
    return { type: 'image/svg+xml', body: iconSvg(logo, false) }
  }
  const png = pngs.get(file)
  if (png === undefined) {
    return null
  }
  return {
    type: 'image/png',
    body: await sharp(Buffer.from(iconSvg(logo, png.maskable)))
      .resize(png.size, png.size)
      .png()
      .toBuffer(),
  }
}

function iconSvg(logo: string, maskable: boolean) {
  const id = readAppIcon()
  const icon = appIcons.find((item) => item.id === id)
  if (icon === undefined) {
    throw new Error(`unknown app icon ${id}`)
  }
  const size = 512 * (maskable ? Math.min(icon.scale, 0.56) : icon.scale)
  const offset = (512 - size) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${tile(icon, maskable)}${logo.replace('<svg ', `<svg x="${offset}" y="${offset}" width="${size}" height="${size}" `)}</svg>`
}

function tile(icon: (typeof appIcons)[number], maskable: boolean) {
  if (icon.tile === null) {
    return ''
  }
  if (maskable || icon.tile.shape === 'square') {
    return `<rect width="512" height="512" fill="${icon.tile.color}"/>`
  }
  if (icon.tile.shape === 'rounded') {
    return `<rect width="512" height="512" rx="112.64" fill="${icon.tile.color}"/>`
  }
  if (icon.tile.shape === 'circle') {
    return `<circle cx="256" cy="256" r="256" fill="${icon.tile.color}"/>`
  }
  throw new Error(`unknown tile shape for ${icon.id}`)
}
