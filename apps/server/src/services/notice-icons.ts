import {
  AlertCircleIcon,
  BadgeQuestionMarkIcon,
  CheckmarkCircle03Icon,
  Notification01Icon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import { projectColorIndex } from '@offsite/core/projects'
import type { NoticeState } from '@offsite/core/push'
import sharp from 'sharp'
import { logger } from '../lib/log.ts'
import { keepImage } from './notice-images.ts'
import { projects } from './projects.ts'

const log = logger.withTag('notice-icons')

const SIZE = 192
const STATUS_SIZE = 157
const STATUS_STROKE = 1.75
const MARK_CENTER = 136
const MARK_SIZE = 59
const MARK_GAP = 8
const MARK_RADIUS = MARK_SIZE / 4
const DRAWABLE_LOGOS = ['data:image/webp;', 'data:image/svg+xml;']
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

export async function noticeIcon(projectId: string, state: NoticeState) {
  const mark = projectMark(projectId)
  const status = statusSvg(state)
  const cut = MARK_SIZE + MARK_GAP * 2
  const body =
    mark === null
      ? status
      : `<defs><mask id="cut"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><rect x="${MARK_CENTER - cut / 2}" y="${MARK_CENTER - cut / 2}" width="${cut}" height="${cut}" rx="${MARK_RADIUS + MARK_GAP}" fill="#000"/></mask></defs><g mask="url(#cut)">${status}</g>${mark}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`
  try {
    const png = await sharp(Buffer.from(svg), { density: 144 })
      .resize(SIZE, SIZE)
      .png()
      .toBuffer()
    return keepImage(png)
  } catch (error) {
    log.warn('could not build the notification icon:', error)
    return null
  }
}

function statusSvg(state: NoticeState) {
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

function projectMark(projectId: string) {
  const project = projects().find((item) => item.id === projectId)
  if (project === undefined || project.scratch) {
    return null
  }
  const corner = MARK_CENTER - MARK_SIZE / 2
  const box = `x="${corner}" y="${corner}" width="${MARK_SIZE}" height="${MARK_SIZE}"`
  const logo = project.logo
  if (
    logo !== null &&
    DRAWABLE_LOGOS.some((prefix) => logo.startsWith(prefix))
  ) {
    return `<clipPath id="logo"><rect ${box} rx="${MARK_RADIUS}"/></clipPath><image ${box} href="${logo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>`
  }
  const color =
    PROJECT_COLORS[projectColorIndex(project.name, PROJECT_COLORS.length)]
  return `<rect ${box} rx="${MARK_RADIUS}" fill="${color}"/>`
}
