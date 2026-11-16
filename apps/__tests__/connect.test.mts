import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { expect, type Page, test } from '@playwright/test'
import getPort from 'get-port'

const server = path.join(import.meta.dirname, '..', 'server')
const started: ChildProcess[] = []
const folders: string[] = []

test.describe.configure({ timeout: 60_000 })
test.use({ actionTimeout: 10_000 })

let hub: string
let windows: string
let windowsDir: string

function folder() {
  const made = mkdtempSync(path.join(tmpdir(), 'offsite-e2e-'))
  folders.push(made)
  return made
}

async function start(...given: string[]) {
  const child = spawn('node', ['src/main.ts', ...given], { cwd: server })
  started.push(child)
  let output = ''
  return await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (data) => {
      output += String(data)
      const running = output.match(/offsite is running at (\S+)/)
      if (running !== null) {
        resolve(running[1])
      }
    })
    child.stderr.on('data', (data) => {
      output += String(data)
    })
    child.on('exit', (code) =>
      reject(new Error(`offsite exited with ${code}:\n${output}`))
    )
  })
}

async function offsite(...given: string[]) {
  const { stdout } = await promisify(execFile)(
    'node',
    ['src/main.ts', ...given],
    {
      cwd: server,
    }
  )
  return stdout
}

async function pairingLink(dir: string) {
  const link = (await offsite('pair', '--dir', dir)).match(/\S+\/pair#\S+/)
  if (link === null) {
    throw new Error('offsite pair printed no link')
  }
  return link[0]
}

async function openSettings(page: Page, machine: string) {
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await page.getByRole('button', { name: machine, exact: true }).click()
}

function addresses(page: Page) {
  return page.locator('div:has(> [title="Drag to reorder"]) input')
}

function shownAddresses(page: Page) {
  return expect.poll(() =>
    addresses(page).evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value)
    )
  )
}

test.beforeAll(async () => {
  const hubPort = await getPort()
  const windowsPort = await getPort()
  const hubDir = folder()
  windowsDir = folder()
  const firstLink = await start(
    '--port',
    String(windowsPort),
    '--dir',
    windowsDir
  )
  windows = new URL(firstLink).origin
  hub = await start(
    '--port',
    String(hubPort),
    '--dir',
    hubDir,
    '--no-auth',
    '--connect',
    `http://127.0.0.1:${hubPort}`,
    '--connect-name',
    'Hub'
  )
  await offsite(
    'connect',
    'add',
    firstLink,
    '--address',
    `http://localhost:${windowsPort}`,
    '--name',
    'Windows',
    '--dir',
    hubDir
  )
})

test.afterAll(() => {
  for (const child of started) {
    child.kill()
  }
  for (const made of folders) {
    rmSync(made, { recursive: true, force: true })
  }
})

test('a browser that opens the hub gets its machines and logs in to them with the keys it forwards', async ({
  page,
}) => {
  await page.goto(hub)
  await openSettings(page, 'Windows')

  await expect(page.getByText('Online', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Windows'
  )
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeDisabled()
  await shownAddresses(page).toEqual([
    `http://localhost:${new URL(windows).port}`,
    windows,
  ])
  for (const address of await addresses(page).all()) {
    await expect(address).toBeDisabled()
  }
  await expect(page.getByText('Pairing link or code')).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Remove machine' })
  ).toBeHidden()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Hub', exact: true }).click()
  await expect(page.getByText('Online', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Hub')
})

test('keeps addresses added in the browser, in the order set there, when the hub lists the machine again', async ({
  page,
}) => {
  const added = 'http://windows.local:1'
  await page.goto(hub)
  await openSettings(page, 'Windows')
  await page.getByRole('button', { name: 'Add address' }).click()
  await page.getByPlaceholder('http://192.168.1.10:47841').fill(added)
  await page.getByPlaceholder('http://192.168.1.10:47841').press('Enter')
  const from = page.locator(
    `div:has(> input[value="${added}"]) > [title="Drag to reorder"]`
  )
  const to = addresses(page).first()
  const handle = await from.boundingBox()
  const top = await to.boundingBox()
  if (handle === null || top === null) {
    throw new Error('the addresses are not shown')
  }
  const x = handle.x + handle.width / 2
  await page.mouse.move(x, handle.y + handle.height / 2)
  await page.mouse.down()
  for (let y = handle.y; y >= top.y - 10; y -= 5) {
    await page.mouse.move(x, y)
  }
  await page.mouse.up()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Windows', exact: true }).click()
  await expect(addresses(page).first()).toHaveValue(added)

  await page.reload()
  await openSettings(page, 'Windows')

  await shownAddresses(page).toEqual([
    added,
    `http://localhost:${new URL(windows).port}`,
    windows,
  ])
  await expect(addresses(page).first()).toBeEnabled()
  await expect(addresses(page).nth(1)).toBeDisabled()
  await expect(addresses(page).nth(2)).toBeDisabled()
})

test('a browser needs pairing with a machine that has pairing on, and logs in once paired', async ({
  page,
}) => {
  await page.goto(windows)
  await page.getByRole('textbox', { name: 'Pairing link' }).fill(windows)
  await page.getByRole('button', { name: 'Connect' }).click()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Connection' }).click()
  await expect(page.getByText('Needs pairing', { exact: true })).toBeVisible()

  await page
    .getByPlaceholder('Pairing link or code')
    .fill(await pairingLink(windowsDir))
  await page.getByRole('button', { name: 'Pair', exact: true }).click()

  await expect(page.getByText('Online', { exact: true }).first()).toBeVisible()
})
