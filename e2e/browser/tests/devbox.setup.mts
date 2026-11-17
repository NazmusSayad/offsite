import { setTimeout as sleep } from 'node:timers/promises'
import { expect, test } from '@playwright/test'
import { devboxStatus } from './devbox.mts'

test('the devbox sets up offsite and the dev servers', async () => {
  test.setTimeout(30 * 60_000)
  let status = await devboxStatus().catch(() => null)
  while (status === null || !status.done) {
    await sleep(5000)
    status = await devboxStatus().catch(() => null)
  }
  console.log(`Testing offsite ${status.version}`)
  for (const entry of Object.entries(status.states)) {
    console.log(`${entry[0]}: ${entry[1].state} ${entry[1].error}`)
  }
  expect(status.states.offsite?.state, status.states.offsite?.error).toBe(
    'ready'
  )
})
