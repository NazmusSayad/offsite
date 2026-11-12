import { installFromBrowser } from '../services/service/setup.ts'
import { busyReasons } from '../services/service/status.ts'
import { checkNow, updateNow } from '../services/service/update.ts'
import type { Handlers } from './socket.ts'

export const serviceHandlers: Pick<
  Handlers,
  'service.busy' | 'service.install' | 'service.update' | 'service.check'
> = {
  'service.busy': () => busyReasons(),
  'service.check': () => checkNow(),
  'service.install': async (params) => {
    await installFromBrowser(params)
    return null
  },
  'service.update': async () => {
    await updateNow()
    return null
  },
}
