import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as icons from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { NOTICE_STATES } from '../../core/src/push.ts'
import { CLAUDE_LOGO, OPENCODE_LOGO } from '../src/components/provider-logos.ts'

const SIZE = 192
const BADGE_X = 136
const BADGE_Y = 56
const BADGE_RADIUS = 56
const BADGE_GAP = 10
const LOGO_COLOR = '#d1d8e6'

const output = path.join(import.meta.dirname, '../public/notification-icons')

const sources = {
  claude: {
    scale: 0.78,
    svg: (size: number) =>
      renderToStaticMarkup(
        createElement(
          'svg',
          {
            viewBox: '0 0 256 257',
            width: size,
            height: size,
            fill: '#d97757',
          },
          createElement('path', { d: CLAUDE_LOGO })
        )
      ),
  },
  codex: {
    scale: 0.8,
    svg: (size: number) => hugeicon(icons.ChatGptIcon, LOGO_COLOR, size, 1.5),
  },
  opencode: {
    scale: 0.62,
    svg: (size: number) =>
      renderToStaticMarkup(
        createElement(
          'svg',
          {
            viewBox: '0 0 240 300',
            width: size,
            height: size,
            fill: LOGO_COLOR,
          },
          createElement('path', { d: OPENCODE_LOGO.inner, opacity: 0.4 }),
          createElement('path', { d: OPENCODE_LOGO.outer })
        )
      ),
  },
}

const badges = {
  done: { icon: icons.CheckmarkCircle03Icon, color: '#94da5b' },
  asks: { icon: icons.BadgeQuestionMarkIcon, color: '#eeb04d' },
  approve: { icon: icons.ShieldAlertIcon, color: '#eeb04d' },
  'not-sent': { icon: icons.AlertCircleIcon, color: '#f94f62' },
  push: { icon: icons.Notification01Icon, color: '#6cbcfe' },
}

function hugeicon(
  icon: typeof icons.ChatGptIcon,
  color: string,
  size: number,
  strokeWidth: number
) {
  return renderToStaticMarkup(
    createElement(HugeiconsIcon, { icon, size, color, strokeWidth })
  )
}

function place(svg: string, x: number, y: number) {
  return svg.replace('<svg ', `<svg x="${x}" y="${y}" `)
}

function render(logo: (typeof sources)['claude'], state: keyof typeof badges) {
  const logoSize = SIZE * logo.scale
  const logoOffset = (SIZE - logoSize) / 2
  const logoSvg = place(logo.svg(logoSize), logoOffset, logoOffset)
  const badge = badges[state]
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`
  const mask = `<mask id="cut"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><circle cx="${BADGE_X}" cy="${BADGE_Y}" r="${BADGE_RADIUS + BADGE_GAP}" fill="#000"/></mask>`
  const badgeSvg = place(
    hugeicon(badge.icon, badge.color, BADGE_RADIUS * 2, 1.75),
    BADGE_X - BADGE_RADIUS,
    BADGE_Y - BADGE_RADIUS
  )
  return `${open}<defs>${mask}</defs><g mask="url(#cut)">${logoSvg}</g>${badgeSvg}</svg>`
}

mkdirSync(output, { recursive: true })
for (const entry of Object.entries(sources)) {
  for (const state of NOTICE_STATES) {
    await sharp(Buffer.from(render(entry[1], state)), { density: 144 })
      .resize(SIZE, SIZE)
      .png()
      .toFile(path.join(output, `${entry[0]}-${state}.png`))
  }
}
