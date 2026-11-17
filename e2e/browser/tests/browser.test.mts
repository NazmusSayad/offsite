import { setTimeout as sleep } from 'node:timers/promises'
import { expect, type Page, test } from '@playwright/test'
import { apps } from '../apps.mts'
import { devboxStatus, editProbe, pairCode } from './devbox.mts'

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
  await page.getByRole('button', { name: /^New thread/ }).click()
  await page.getByRole('heading', { level: 1 }).getByRole('button').click()
  await page.getByRole('menuitem', { name: 'Add project' }).click()
  await page.getByRole('textbox', { name: 'Folder path' }).fill(project)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add project', exact: true })
    .click()
  await expect(page).toHaveURL(/project=/)
  const url = new URL(page.url())
  url.searchParams.set('panel', 'browser')
  url.searchParams.set('browse', target)
  await page.goto(url.href)
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
    const frame = page.frameLocator('iframe')
    const title = frame.locator('#probe-title')
    const count = frame.locator('#count')
    const address = page.getByRole('textbox', { name: 'URL or file path' })
    const errors = watchErrors(page)
    await openBrowserPanel(page, base, `/apps/probe-${app.name}`, probe)

    await test.step('loads the page', async () => {
      await expect(title).toHaveText('Probe original', { timeout: 60_000 })
    })

    await test.step('shows the page its own address', async () => {
      await expect.soft(frame.locator('#location')).toHaveText(probe)
    })

    await test.step('responds to clicks', async () => {
      await count.click()
      await count.click()
      await expect.soft(count).toHaveText('count 2')
    })

    await test.step('calls its API', async () => {
      const result = frame.locator('#api-result')
      await frame.locator('#api').click()
      if (!app.server) {
        await expect.soft(result).toHaveText('hello')
        return
      }
      await expect.soft(result).toHaveText(/^hello (new|seen)$/)
      await frame.locator('#api').click()
      await expect.soft(result).toHaveText('hello seen')
      await expect.soft(frame.locator('#cookie')).toHaveText('yes')
    })

    await test.step('updates on edit', async () => {
      await editProbe(app.name, 'edited')
      try {
        await expect.soft(title).toHaveText('Probe edited', { timeout: 30_000 })
        if (app.keepsState) {
          await expect.soft(count).toHaveText('count 2')
        }
      } finally {
        await editProbe(app.name, 'original')
      }
      await expect.soft(title).toHaveText('Probe original', {
        timeout: 30_000,
      })
    })

    await test.step('follows a link', async () => {
      await frame.locator('#other').click()
      await expect.soft(address).toHaveValue(other)
      await expect.soft(title).toHaveCount(0)
    })

    await test.step('goes back', async () => {
      await page.getByRole('button', { name: 'Back', exact: true }).click()
      await expect.soft(address).toHaveValue(probe)
      await expect.soft(title).toHaveText('Probe original')
    })

    await test.step('goes forward', async () => {
      await page.getByRole('button', { name: 'Forward', exact: true }).click()
      await expect.soft(address).toHaveValue(other)
      await expect.soft(title).toHaveCount(0)
    })

    await test.step('reloads', async () => {
      await page.getByRole('button', { name: 'Reload', exact: true }).click()
      await expect.soft(address).toHaveValue(other)
      await expect.soft(frame.locator('body')).not.toBeEmpty()
    })

    await test.step('logs no errors', async () => {
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
    await expect(
      page.frameLocator('iframe').getByText('Inbox').first()
    ).toBeVisible({ timeout: 90_000 })
  })

  await test.step('logs no errors', async () => {
    expect.soft(errors).toEqual([])
  })
})
