import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  type Browser,
  type BrowserContextOptions,
  devices,
  expect,
  type Page,
  test,
} from '@playwright/test'
import getPort from 'get-port'

const server = path.join(import.meta.dirname, '..', 'server')
const started: ChildProcess[] = []
const folders: string[] = []
const notice = 'Message not sent · Fix the login page'
const delivered = new Map<Page, number>()

test.describe.configure({ timeout: 180_000 })
test.use({ actionTimeout: 10_000, channel: 'chromium' })

type Machine = { url: string; ready: string; release: string }

function folder() {
  const made = mkdtempSync(path.join(tmpdir(), 'offsite-e2e-'))
  folders.push(made)
  return made
}

function writeConversation(sessions: string, cwd: string, title: string) {
  const sessionId = randomUUID()
  const lines = [
    {
      type: 'user',
      message: { role: 'user', content: title },
      uuid: randomUUID(),
      parentUuid: null,
      isSidechain: false,
      userType: 'external',
      sessionId,
      cwd,
      timestamp: new Date().toISOString(),
    },
    { type: 'custom-title', customTitle: title, sessionId },
  ]
  writeFileSync(
    path.join(sessions, `${sessionId}.jsonl`),
    lines.map((line) => `${JSON.stringify(line)}\n`).join('')
  )
}

function writeClaude(
  bin: string,
  sessions: string,
  ready: string,
  release: string
) {
  mkdirSync(bin)
  const claude = path.join(bin, 'claude')
  writeFileSync(
    claude,
    [
      '#!/bin/sh',
      'for arg in "$@"; do',
      '  case "$arg" in',
      '    --resume=*)',
      `      touch "${sessions}/\${arg#--resume=}.jsonl"`,
      '      sleep 2',
      `      touch "${ready}"`,
      `      while [ ! -f "${release}" ]; do sleep 0.1; done`,
      '      ;;',
      '  esac',
      'done',
      'exit 1',
      '',
    ].join('\n')
  )
  chmodSync(claude, 0o755)
}

async function startOffsite(home: string, dir: string, bin: string) {
  const port = await getPort()
  const child = spawn(
    process.execPath,
    [
      'src/main.ts',
      '--port',
      String(port),
      '--dir',
      dir,
      '--no-auth',
      '--pwa',
      '--connect',
      `http://127.0.0.1:${port}`,
    ],
    {
      cwd: server,
      env: {
        HOME: home,
        PATH: [bin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(
          path.delimiter
        ),
      },
    }
  )
  started.push(child)
  let output = ''
  return await new Promise<string>((resolve, reject) => {
    child.stdout.on('data', (data) => {
      output += String(data)
      const running = output.match(/offsite is running at (\S+)/)
      if (running !== null) {
        resolve(new URL(running[1]).origin)
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

async function startMachine(browser: Browser): Promise<Machine> {
  const home = folder()
  const dir = folder()
  const bin = path.join(home, 'bin')
  const project = path.join(home, 'work')
  const sessions = path.join(
    home,
    '.claude',
    'projects',
    project.replace(/[^a-zA-Z0-9]/g, '-')
  )
  const ready = path.join(home, 'ready')
  const release = path.join(home, 'release')
  mkdirSync(project)
  mkdirSync(sessions, { recursive: true })
  writeConversation(sessions, project, 'Fix the login page')
  writeConversation(sessions, project, 'Update the docs')
  writeClaude(bin, sessions, ready, release)
  writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({
      version: 4,
      claude: {
        accounts: [
          { id: 'work', provider: 'claude', name: 'Work', configDir: {} },
        ],
      },
    })
  )
  const url = await startOffsite(home, dir, bin)

  const page = await browser.newPage()
  await page.goto(url)
  await page.getByRole('button', { name: 'Inbox' }).click()
  await page.getByRole('menuitem', { name: 'Add project' }).click()
  await page.getByRole('textbox', { name: 'Folder path' }).fill(project)
  await page.getByRole('button', { name: 'Add project', exact: true }).click()
  await expect(page.getByText('Done')).toBeVisible()
  await page.close()
  return { url, ready, release }
}

async function openDevice(
  browser: Browser,
  machine: Machine,
  options: BrowserContextOptions = {}
) {
  const context = await browser.newContext(options)
  await context.grantPermissions(['notifications'], { origin: machine.url })
  const page = await context.newPage()
  delivered.set(page, 0)
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => {
      if (String(frame.payload).startsWith('{"type":"notice",')) {
        delivered.set(page, (delivered.get(page) ?? 0) + 1)
      }
    })
  )
  await page.goto(machine.url)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(page.getByText('Done')).toBeVisible()
  return page
}

async function openFromDone(page: Page, title: string) {
  await page.getByText('Done').click()
  await page.getByText(title).click()
}

async function queueMessage(machine: Machine, page: Page, text: string) {
  rmSync(machine.ready, { force: true })
  rmSync(machine.release, { force: true })
  const composer = page.getByRole('main').getByRole('textbox')
  await composer.pressSequentially('Keep going')
  await composer.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Stop generation' })
  ).toBeVisible()
  await composer.pressSequentially(text)
  await composer.press('Control+Enter')
  await expect(page.getByRole('button', { name: 'Send now' })).toBeVisible()
  await expect.poll(() => existsSync(machine.ready)).toBe(true)
}

function finishRun(machine: Machine) {
  writeFileSync(machine.release, '')
}

async function switchAway(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  const other = await page.context().newPage()
  await other.bringToFront()
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false)
}

async function shown(page: Page) {
  return await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return (await registration.getNotifications()).map((item) => item.title)
  })
}

test.afterEach(() => {
  for (const child of started.splice(0)) {
    child.kill()
  }
  for (const made of folders.splice(0)) {
    rmSync(made, { recursive: true, force: true })
  }
})

test('a desktop with offsite on screen stays quiet', async ({ browser }) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')

  await queueMessage(machine, laptop, 'Add a test')
  finishRun(machine)

  await expect.poll(() => delivered.get(laptop)).toBe(1)
  await laptop.waitForTimeout(1000)
  expect(await shown(laptop)).toEqual([])
})

test('a desktop where offsite is not focused shows the notification', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')

  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  finishRun(machine)

  await expect.poll(() => shown(laptop)).toEqual([notice])
})

test('a phone showing the conversation list stays quiet', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')
  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  const phone = await openDevice(browser, machine, devices['Pixel 7'])

  finishRun(machine)

  await expect.poll(() => delivered.get(phone)).toBe(1)
  await phone.waitForTimeout(1000)
  expect(await shown(phone)).toEqual([])
  expect(delivered.get(laptop)).toBe(0)
})

test('a phone showing the same conversation stays quiet', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')
  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  const phone = await openDevice(browser, machine, devices['Pixel 7'])
  await phone.getByText('Fix the login page').click()

  finishRun(machine)

  await expect.poll(() => delivered.get(phone)).toBe(1)
  await phone.waitForTimeout(1000)
  expect(await shown(phone)).toEqual([])
  expect(delivered.get(laptop)).toBe(0)
})

test('a phone showing another conversation shows the notification', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')
  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  const phone = await openDevice(browser, machine, devices['Pixel 7'])
  await openFromDone(phone, 'Update the docs')

  finishRun(machine)

  await expect.poll(() => shown(phone)).toEqual([notice])
  expect(delivered.get(laptop)).toBe(0)
})

test('only the most recently used device gets the notification, and the next one gets it a minute later if it stays unused', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')
  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  const desktop = await openDevice(browser, machine)
  await openFromDone(desktop, 'Update the docs')
  await switchAway(desktop)

  finishRun(machine)

  await expect.poll(() => shown(desktop)).toEqual([notice])
  expect(delivered.get(laptop)).toBe(0)
  await expect.poll(() => shown(laptop), { timeout: 70_000 }).toEqual([notice])
})

test('the notification stays on the device that is used within a minute', async ({
  browser,
}) => {
  const machine = await startMachine(browser)
  const laptop = await openDevice(browser, machine)
  await openFromDone(laptop, 'Fix the login page')
  await queueMessage(machine, laptop, 'Add a test')
  await switchAway(laptop)
  const desktop = await openDevice(browser, machine)
  await openFromDone(desktop, 'Update the docs')
  await switchAway(desktop)

  finishRun(machine)

  await expect.poll(() => shown(desktop)).toEqual([notice])
  await desktop.bringToFront()
  await desktop.waitForTimeout(65_000)
  expect(delivered.get(laptop)).toBe(0)
})
