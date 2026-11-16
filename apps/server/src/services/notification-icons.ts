import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AlertCircleIcon,
  BadgeQuestionMarkIcon,
  CheckmarkCircle03Icon,
  Notification01Icon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import {
  NO_PROJECT,
  type Project,
  projectColorIndex,
} from '@offsite/core/projects'
import { NOTIFICATION_STATES, type NotificationState } from '@offsite/core/push'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { logger } from '../lib/log.ts'
import { db } from '../storage/db.ts'
import { notificationIcons } from '../storage/schema.ts'
import { projects } from './projects.ts'

const log = logger.withTag('notification-icons')

const PREFIX = '/api/notification-icon/v1/'
const SIZE = 192
const STATUS_SIZE = 157
const STATUS_STROKE = 1.75
const MARK_CENTER = 136
const MARK_SIZE = 59
const MARK_GAP = 8
const MARK_RADIUS = MARK_SIZE / 4
const WEBP_LOGO = 'data:image/webp;base64,'
const SVG_LOGO = 'data:image/svg+xml;'
const PROJECT_COLORS = [
  '#9ca3af',
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#facc15',
  '#a3e635',
  '#4ade80',
  '#34d399',
  '#2dd4bf',
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#c084fc',
  '#e879f9',
  '#f472b6',
  '#fb7185',
]

const statuses = {
  done: { icon: CheckmarkCircle03Icon, color: '#94da5b' },
  asks: { icon: BadgeQuestionMarkIcon, color: '#eeb04d' },
  approve: { icon: ShieldAlertIcon, color: '#eeb04d' },
  'not-sent': { icon: AlertCircleIcon, color: '#f94f62' },
  push: { icon: Notification01Icon, color: '#6cbcfe' },
}

export function notificationIconPath(
  projectId: string,
  state: NotificationState
) {
  return `${PREFIX}${projectId}/${state}`
}

export async function serveNotificationIcon(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse
) {
  const parts = pathname.slice(PREFIX.length).split('/')
  const state = NOTIFICATION_STATES.find((item) => item === parts[1])
  if (
    !pathname.startsWith(PREFIX) ||
    parts.length !== 2 ||
    state === undefined
  ) {
    response.statusCode = 404
    response.end('not found')
    return
  }
  try {
    const icon = await notificationIcon(parts[0], state)
    const etag = `"${createHash('sha256').update(icon).digest('base64url')}"`
    response.setHeader('cache-control', 'private, max-age=3600')
    response.setHeader('etag', etag)
    response.setHeader('access-control-allow-origin', '*')
    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304
      response.end()
      return
    }
    response.setHeader('content-type', 'image/png')
    response.end(icon)
  } catch (error) {
    log.warn('could not serve the notification icon:', error)
    response.statusCode = 500
    response.end('could not draw the notification icon')
  }
}

async function notificationIcon(projectId: string, state: NotificationState) {
  const found = projects().find((item) => item.id === projectId)
  const project = found === undefined || found.scratch ? null : found
  const key = `${PREFIX}${project === null ? NO_PROJECT : project.id}/${state}`
  const saved = db
    .select()
    .from(notificationIcons)
    .where(eq(notificationIcons.key, key))
    .get()
  if (saved !== undefined) {
    return saved.image
  }
  const mark = project === null ? null : await projectMark(project)
  const status = statusSvg(state)
  const cut = MARK_SIZE + MARK_GAP * 2
  const body =
    mark === null
      ? status
      : `<defs><mask id="cut"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><rect x="${MARK_CENTER - cut / 2}" y="${MARK_CENTER - cut / 2}" width="${cut}" height="${cut}" rx="${MARK_RADIUS + MARK_GAP}" fill="#000"/></mask></defs><g mask="url(#cut)">${status}</g>${mark}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`
  const png = await sharp(Buffer.from(svg), { density: 144 })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer()
  db.insert(notificationIcons)
    .values({
      key,
      projectId: project === null ? null : project.id,
      image: png,
    })
    .onConflictDoNothing()
    .run()
  return png
}

function statusSvg(state: NotificationState) {
  const status = statuses[state]
  const elements = status.icon.map((element) => {
    const attributes = Object.entries(element[1])
      .filter((attribute) => attribute[0] !== 'key')
      .map((attribute) => {
        const name = attribute[0].replaceAll(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`
        )
        if (attribute[0] === 'strokeWidth') {
          return `${name}="${STATUS_STROKE}"`
        }
        if (attribute[1] === 'currentColor') {
          return `${name}="${status.color}"`
        }
        return `${name}="${attribute[1]}"`
      })
    return `<${element[0]} ${attributes.join(' ')}/>`
  })
  const offset = (SIZE - STATUS_SIZE) / 2
  return `<svg x="${offset}" y="${offset}" width="${STATUS_SIZE}" height="${STATUS_SIZE}" viewBox="0 0 24 24" fill="none">${elements.join('')}</svg>`
}

async function projectMark(project: Project) {
  const corner = MARK_CENTER - MARK_SIZE / 2
  const box = `x="${corner}" y="${corner}" width="${MARK_SIZE}" height="${MARK_SIZE}"`
  const logo = project.logo
  if (logo !== null && logo.startsWith(WEBP_LOGO)) {
    const png = await sharp(Buffer.from(logo.slice(WEBP_LOGO.length), 'base64'))
      .png()
      .toBuffer()
    return `<clipPath id="logo"><rect ${box} rx="${MARK_RADIUS}"/></clipPath><image ${box} href="data:image/png;base64,${png.toString('base64')}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>`
  }
  if (logo !== null && logo.startsWith(SVG_LOGO)) {
    return `<clipPath id="logo"><rect ${box} rx="${MARK_RADIUS}"/></clipPath><image ${box} href="${logo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>`
  }
  const color =
    PROJECT_COLORS[projectColorIndex(project.name, PROJECT_COLORS.length)]
  return `<rect ${box} rx="${MARK_RADIUS}" fill="${color}"/>`
}
