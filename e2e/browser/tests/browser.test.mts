import { setTimeout as sleep } from 'node:timers/promises'
import { expect, type Page, test } from '@playwright/test'
import { apps } from '../apps.mts'
import { devboxStatus, editProbe, pairCode } from './devbox.mts'

const softly = expect.configure({ soft: true })
let tunnel: Promise<string> | null = null

async function findTunnel() {
  const deadline = Date.now() + 120_000
  let host = ''
  while (Date.now() < deadline) {
    const response = await fetch('http://tunnel:2000/quicktunnel').catch(
      () => null
    )
    if (response !== null && response.ok) {
      const tunnel: { hostname: string } = await response.json()
      host = tunnel.hostname
    }
    if (host !== '') {
      const page = await fetch(`https://${host}/`).catch(() => null)
      if (page !== null && page.ok) {
        return `https://${host}`
      }
    }
    await sleep(3000)
  }
  throw new Error(
    host === ''
      ? 'The Cloudflare quick tunnel gave no address in 2 minutes'
      : `The Cloudflare quick tunnel https://${host} did not answer in 2 minutes`
  )
}

function origin(connection: string) {
  if (connection === 'direct') {
    return Promise.resolve('http://devbox:47841')
  }
  if (connection === 'https') {
    return Promise.resolve('https://offsite.test')
  }
  if (connection === 'tunnel') {
    tunnel ??= findTunnel()
    return tunnel
  }
  throw new Error(`Unknown connection ${connection}`)
}

async function devServer(name: string) {
  const state = (await devboxStatus()).states[name]
  if (state === undefined) {
    throw new Error(`The devbox never started ${name}`)
  }
  if (state.state !== 'ready') {
    throw new Error(
      `${name} did not start: ${state.error}\n${state.log.slice(-40).join('\n')}`
    )
  }
  return state.url
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`${message.location().url}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => errors.push(`page error: ${error.message}`))
  return errors
}

async function readPage(page: Page) {
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await page.getByRole('textbox', { name: 'Page', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('ControlOrMeta+C')
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => navigator.clipboard.readText())
    if (text !== '') {
      return text
    }
    await sleep(100)
  }
  return ''
}

async function paintedColors(page: Page) {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (context === null || canvas.width === 0 || canvas.height === 0) {
      return 0
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const colors = new Set<number>()
    for (let index = 0; index < pixels.length; index += 4 * 31) {
      colors.add(
        (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]
      )
    }
    return colors.size
  })
}

async function pressInPage(page: Page, tabs: number) {
  const screen = await page.locator('canvas').boundingBox()
  if (screen === null) {
    throw new Error('The browser panel shows no page')
  }
  await page.mouse.click(screen.x + screen.width - 40, screen.y + 10)
  for (let tab = 0; tab < tabs; tab += 1) {
    await page.keyboard.press('Tab')
  }
  await page.keyboard.press('Enter')
}

async function openBrowserPanel(
  page: Page,
  base: string,
  project: string,
  target: string
) {
  const code = await pairCode()
  await page.goto(
    `${base}/pair#machine=${encodeURIComponent(base)}&code=${code}`
  )
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible({
    timeout: 60_000,
  })
  const dialog = page.getByRole('dialog', { name: 'Add project' })
  const heading = page.getByRole('heading', { level: 1 }).getByRole('button')
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^New thread/ }).click()
    await expect(dialog.or(heading)).toBeVisible({ timeout: 5000 })
  }).toPass({ timeout: 60_000 })
  if (!(await dialog.isVisible())) {
    await heading.click()
    await page.getByRole('menuitem', { name: 'Add project' }).click()
  }
  await dialog.getByRole('textbox', { name: 'Folder path' }).fill(project)
  await dialog
    .getByRole('button', { name: 'Add project', exact: true })
    .click({ timeout: 60_000 })
  await expect(page).toHaveURL(/project=[0-9a-f]{8}-/)
  const url = new URL(page.url())
  url.searchParams.set('panel', 'browser')
  url.searchParams.set('browse', target)
  await expect(async () => {
    await page.goto(url.href)
  }).toPass({ timeout: 30_000 })
}

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('panel', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  const state = (await devboxStatus()).states[testInfo.title]
  if (state !== undefined) {
    await testInfo.attach('dev server log', {
      body: state.log.join('\n'),
      contentType: 'text/plain',
    })
  }
})

for (const app of apps) {
  test(app.name, async ({ page }, testInfo) => {
    const base = await origin(testInfo.project.name)
    const url = await devServer(app.name)
    const probe = new URL(app.probe, url).href
    const other = new URL(app.other, url).href
    const title = /Probe (original|edited)/
    const address = page.getByRole('textbox', { name: 'URL or file path' })
    const errors = watchErrors(page)

    async function showsOtherPage() {
      const text = await readPage(page)
      return text !== '' && !title.test(text)
    }

    await editProbe(app.name, 'original')
    await openBrowserPanel(page, base, `/apps/probe-${app.name}`, probe)

    await test.step('loads the page', async () => {
      await expect
        .poll(() => readPage(page), { timeout: 180_000 })
        .toContain('Probe original')
    })

    await test.step('shows the page its own address', async () => {
      await softly.poll(() => readPage(page)).toContain(probe)
    })

    await test.step('responds to input', async () => {
      await pressInPage(page, 1)
      await pressInPage(page, 1)
      await softly.poll(() => readPage(page)).toContain('count 2')
    })

    await test.step('calls its API', async () => {
      await pressInPage(page, 2)
      if (!app.server) {
        await softly.poll(() => readPage(page)).toMatch(/^hello$/m)
        return
      }
      await softly.poll(() => readPage(page)).toMatch(/^hello (new|seen)$/m)
      await pressInPage(page, 2)
      await softly.poll(() => readPage(page)).toMatch(/^hello seen$/m)
      await softly.poll(() => readPage(page)).toMatch(/^yes$/m)
    })

    await test.step('updates on edit', async () => {
      await editProbe(app.name, 'edited')
      await softly
        .poll(() => readPage(page), { timeout: 30_000 })
        .toContain('Probe edited')
      if (app.keepsState) {
        await softly.poll(() => readPage(page)).toContain('count 2')
      }
    })

    await test.step('follows a link', async () => {
      await pressInPage(page, 3)
      await expect.soft(address).toHaveValue(other)
      await softly.poll(showsOtherPage).toBe(true)
    })

    await test.step('goes back', async () => {
      await page.getByRole('button', { name: 'Back', exact: true }).click()
      await expect.soft(address).toHaveValue(probe)
      await softly.poll(() => readPage(page)).toMatch(title)
    })

    await test.step('goes forward', async () => {
      await page.getByRole('button', { name: 'Forward', exact: true }).click()
      await expect.soft(address).toHaveValue(other)
      await softly.poll(showsOtherPage).toBe(true)
    })

    await test.step('reloads', async () => {
      await page.getByRole('button', { name: 'Reload', exact: true }).click()
      await expect.soft(address).toHaveValue(other)
      await softly.poll(() => readPage(page)).not.toBe('')
    })

    await test.step('offsite logs no errors', async () => {
      expect.soft(errors).toEqual([])
    })
  })
}

test('offsite-dev', async ({ page }, testInfo) => {
  const base = await origin(testInfo.project.name)
  const url = await devServer('offsite-dev')
  const errors = watchErrors(page)
  await openBrowserPanel(page, base, '/apps/offsite', url)

  await test.step('loads the app', async () => {
    await expect
      .poll(() => paintedColors(page), { timeout: 180_000 })
      .toBeGreaterThan(20)
    await expect(
      page.getByRole('textbox', { name: 'URL or file path' })
    ).toHaveValue(url)
    await expect(page.getByText(/^Could not load/)).toBeHidden()
  })

  await test.step('offsite logs no errors', async () => {
    expect.soft(errors).toEqual([])
  })
})
