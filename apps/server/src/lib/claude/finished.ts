import { waitsForCommands } from '../../services/finished-check.ts'
import { broadcastActivity, holdsCompletion } from '../live.ts'
import type { Run } from './run.ts'

const WAKE_LIMIT = 10 * 1000

export class FinishedState {
  awaiting = false
  private checks = 0
  private wakeTimer: NodeJS.Timeout | undefined

  async check(run: Run) {
    this.checks += 1
    const check = this.checks
    this.awaiting = true
    const waits = await waitsForCommands(run)
    if (check !== this.checks) {
      return
    }
    this.awaiting = waits
    broadcastActivity()
  }

  tasksChanged(run: Run, held: boolean) {
    if (this.awaiting && run.commands.length === 0) {
      this.awaiting = false
    }
    if (!run.running && held && !holdsCompletion(run)) {
      this.expectWake()
    }
  }

  release() {
    this.checks += 1
    clearTimeout(this.wakeTimer)
    this.awaiting = false
  }

  private expectWake() {
    this.checks += 1
    this.awaiting = true
    clearTimeout(this.wakeTimer)
    this.wakeTimer = setTimeout(() => {
      this.awaiting = false
      broadcastActivity()
    }, WAKE_LIMIT)
  }
}
