import { existsSync } from 'node:fs'
import { type Browser, type BrowserContext, chromium } from 'playwright-core'
import { registry } from 'playwright-core/lib/coreBundle'
import { logger } from '../../lib/log.ts'

const log = logger.withTag('browser')
const SANDBOX_FAILED = 'Chromium sandboxing failed'
const LAUNCH = {
  args: [
    '--disable-blink-features=AutomationControlled',
    '--force-device-scale-factor=2',
  ],
  ignoreDefaultArgs: ['--enable-automation', '--hide-scrollbars'],
}

let context: Promise<BrowserContext> | null = null

export function needsInstall() {
  return !existsSync(headlessShell().executablePath())
}

export function openContext() {
  if (context !== null) {
    return context
  }
  const starting = startContext()
  context = starting
  void forgetWhenClosed(starting)
  return starting
}

export async function closeContext() {
  const current = context
  context = null
  const started = await current?.catch(() => null)
  if (started === null || started === undefined) {
    return
  }
  await started.browser()?.close()
  log.info('closed the browser')
}

async function forgetWhenClosed(starting: Promise<BrowserContext>) {
  const started = await starting.catch(() => null)
  if (started !== null) {
    await new Promise((resolve) => started.once('close', resolve))
  }
  if (context === starting) {
    context = null
    log.warn('the browser closed by itself')
  }
}

async function startContext() {
  await registry.registry.install([headlessShell()], {
    force: false,
    gc: false,
  })
  const browser = await launch()
  const session = await browser.newBrowserCDPSession()
  const version = await session.send('Browser.getVersion')
  await session.detach()
  const started = await browser.newContext({
    viewport: null,
    acceptDownloads: true,
    userAgent: version.userAgent.replace('HeadlessChrome/', 'Chrome/'),
  })
  await started.grantPermissions(['clipboard-read', 'clipboard-write'])
  log.info(`started the browser, Chrome ${browser.version()}`)
  return started
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ ...LAUNCH, chromiumSandbox: true })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(SANDBOX_FAILED)) {
      throw error
    }
    log.warn('this machine blocks the Chrome sandbox, so it runs without it')
    return chromium.launch({ ...LAUNCH, chromiumSandbox: false })
  }
}

function headlessShell() {
  const executable = registry.registry.findExecutable('chromium-headless-shell')
  if (executable === undefined) {
    throw new Error('Playwright does not know chromium-headless-shell')
  }
  return executable
}

export function ignoreClosed(error: unknown) {
  if (
    error instanceof Error &&
    /Target page, context or browser has been closed|Session closed|Target closed/.test(
      error.message
    )
  ) {
    return
  }
  log.warn('a browser page action failed:', error)
}
