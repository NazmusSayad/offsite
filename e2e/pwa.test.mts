import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'

const root = path.join(import.meta.dirname, '..')
const dist = path.join(root, 'apps', 'client', 'dist')

function builtFiles() {
  return readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter(
      (name) =>
        name !== 'sw.js' &&
        !name.endsWith('.br') &&
        !name.endsWith('.gz') &&
        statSync(path.join(dist, name)).isFile()
    )
    .map((name) => name.split(path.sep).join('/'))
    .sort()
}

async function savedFiles(page: Page) {
  return await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) =>
      key.startsWith('workbox-precache-')
    )
    if (name === undefined) {
      throw new Error('nothing is saved for offline use')
    }
    const requests = await (await caches.open(name)).keys()
    return requests
      .map((request) => new URL(request.url).pathname.slice(1))
      .sort()
  })
}

async function mainFile(page: Page) {
  return await page.evaluate(() => {
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="/assets/index-"]'
    )
    if (script === null) {
      throw new Error('the page has no main script')
    }
    return script.src
  })
}

test('keeps the saved version working until its update is applied', async ({
  page,
  context,
}) => {
  const port = process.env.OFFSITE_E2E_PORT
  if (port === undefined) {
    throw new Error('the offsite server port is unknown')
  }
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  expect(await savedFiles(page)).toEqual(builtFiles())
  const oldMain = await mainFile(page)

  execFileSync('pnpm', ['--filter', 'client', 'build'], {
    cwd: root,
    env: { ...process.env, OFFSITE_VERSION: 'e2e-next' },
    stdio: 'ignore',
  })
  expect((await page.request.get(oldMain)).status()).toBe(404)

  await page.reload()
  expect(await mainFile(page)).toBe(oldMain)
  expect(
    await page.evaluate(async (url) => (await fetch(url)).status, oldMain)
  ).toBe(200)

  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())?.update()
  })
  const update = page.getByText('Browser update available')
  await Promise.all([page.waitForEvent('load'), update.click()])
  expect(await mainFile(page)).not.toBe(oldMain)
  expect(await savedFiles(page)).toEqual(builtFiles())
  await expect(update).toBeHidden()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Inbox')).toBeVisible()
  await context.setOffline(false)
})
