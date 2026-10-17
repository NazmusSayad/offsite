import type { Composer, Config } from '@offsite/core/protocol'
import { getDraftSettings } from '@/features/composer/drafts'
import { providerSettings, refreshCapabilities } from '@/lib/accounts'
import {
  activityOf,
  draftKey,
  getState,
  setMachine,
  showError,
  update,
} from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { call } from './connection'

function syncedValue<T>(handlers: {
  set: (machine: string, value: T) => void
  save: (machine: string, value: T) => Promise<T | null>
  load: (machine: string) => Promise<T>
  apply: (machine: string, value: T) => void
}) {
  const saves = new Map<
    string,
    { writes: number; version: number; timer: number | undefined }
  >()

  function apply(machine: string, value: T) {
    if (getState().machines.some((item) => item.id === machine))
      {handlers.apply(machine, value)}
  }

  async function save(machine: string, value: T) {
    const saved = await handlers.save(machine, value)
    const pending = saves.get(machine)
    if (pending === undefined) {return}
    pending.writes -= 1
    if (pending.writes > 0) {return}
    if (saved === null) {await refresh(machine)}
    else {apply(machine, saved)}
  }

  async function refresh(machine: string) {
    const version = saves.get(machine)?.version
    try {
      const value = await handlers.load(machine)
      const pending = saves.get(machine)
      if (
        pending !== undefined &&
        pending.writes === 0 &&
        pending.version === version
      )
        {apply(machine, value)}
    } catch (error) {
      showError(error)
    }
  }

  return {
    update(machine: string, value: T) {
      handlers.set(machine, value)
      const pending = saves.get(machine) ?? {
        writes: 0,
        version: 0,
        timer: undefined,
      }
      saves.set(machine, pending)
      if (pending.timer === undefined) {pending.writes += 1}
      pending.version += 1
      window.clearTimeout(pending.timer)
      pending.timer = window.setTimeout(() => {
        pending.timer = undefined
        void save(machine, value)
      }, 300)
    },
    receive(machine: string, value: T) {
      if ((saves.get(machine)?.writes ?? 0) === 0) {apply(machine, value)}
    },
  }
}

const config = syncedValue<Config>({
  set: (machine, value) => setMachine(machine, { config: value }),
  save: async (machine, value) => {
    try {
      const saved = await call(machine, 'config.save', value)
      setMachine(machine, { configError: null })
      return saved
    } catch (error) {
      setMachine(machine, { configError: errorMessage(error) })
      return null
    }
  },
  load: async (machine) =>
    (await call(machine, 'config.get', undefined)).config,
  apply: (machine, value) => setMachine(machine, { config: value }),
})

const composer = syncedValue<Composer>({
  set: (machine, value) => setMachine(machine, { composer: value }),
  save: async (machine, value) => {
    try {
      return await call(machine, 'composer.save', value)
    } catch (error) {
      showError(error)
      return null
    }
  },
  load: (machine) => call(machine, 'composer.get', undefined),
  apply: applyComposer,
})

export const updateConfig = config.update
export const receiveConfig = config.receive
export const updateComposer = composer.update
export const receiveComposer = composer.receive

function applyComposer(machine: string, value: Composer) {
  setMachine(machine, { composer: value })
  const selection = getState().selection
  if (selection === null || selection.machine !== machine) {return}
  const live =
    activityOf(getState().machines, machine, selection.sessionId) !== undefined
  if (live) {return}
  const settings =
    (selection.sessionId === null
      ? null
      : getDraftSettings(draftKey(selection))) ??
    providerSettings(
      value,
      selection.sessionId === null
        ? value.provider
        : getState().settings.provider
    )
  const accountChanged =
    settings.provider !== getState().settings.provider ||
    settings.accountId !== getState().settings.accountId
  update({ settings })
  if (accountChanged) {void refreshCapabilities()}
}
