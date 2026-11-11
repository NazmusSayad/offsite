import { installFromBrowser } from '../services/service/setup.ts'
import { busyReasons } from '../services/service/status.ts'
import { updateNow } from '../services/service/update.ts'
import type { Handlers } from './socket.ts'

export const serviceHandlers: Pick<
  Handlers,
  'service.busy' | 'service.install' | 'service.update'
> = {
  'service.busy': () => busyReasons(),
  'service.install': async (params) => {
    await installFromBrowser(params.manager)
    return null
  },
  'service.update': async () => {
    await updateNow()
    return null
  },
}
