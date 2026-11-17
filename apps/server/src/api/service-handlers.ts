import { checkCleanup, runCleanup } from '../services/cleanup/cleanup.ts'
import { installFromBrowser } from '../services/service/setup.ts'
import { busyReasons } from '../services/service/status.ts'
import { checkNow, restartNow, updateNow } from '../services/service/update.ts'
import type { Handlers } from './socket.ts'

export const serviceHandlers: Pick<
  Handlers,
  | 'service.busy'
  | 'service.install'
  | 'service.update'
  | 'service.restart'
  | 'service.check'
  | 'cleanup.check'
  | 'cleanup.run'
> = {
  'service.busy': () => busyReasons(),
  'service.check': () => checkNow(),
  'cleanup.check': () => checkCleanup(),
  'cleanup.run': (params) => runCleanup(params.ids),
  'service.install': async (params) => {
    await installFromBrowser(params)
    return null
  },
  'service.update': async () => {
    await updateNow()
    return null
  },
  'service.restart': () => {
    restartNow()
    return null
  },
}
