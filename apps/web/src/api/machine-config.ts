import type { Config } from '@offsite/core/protocol'
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

const configSaves = new Map<
  string,
  { writes: number; version: number; timer: number | undefined }
>()
export function updateConfig(machine: string, config: Config) {
  setMachine(machine, { config })
  const save = configSaves.get(machine) ?? {
    writes: 0,
    version: 0,
    timer: undefined,
  }
  configSaves.set(machine, save)
  if (save.timer === undefined) save.writes += 1
  save.version += 1
  window.clearTimeout(save.timer)
  save.timer = window.setTimeout(() => {
    save.timer = undefined
    void saveConfig(machine, config)
  }, 300)
}

async function saveConfig(machine: string, config: Config) {
  let saved: Config | null = null
  try {
    saved = await call(machine, 'config.save', config)
    setMachine(machine, { configError: null })
  } catch (error) {
    setMachine(machine, { configError: errorMessage(error) })
  }
  const save = configSaves.get(machine)
  if (save === undefined) return
  save.writes -= 1
  if (save.writes > 0) return
  if (saved === null) await refreshConfig(machine)
  else applyConfig(machine, saved)
}

export function receiveConfig(machine: string, config: Config) {
  if ((configSaves.get(machine)?.writes ?? 0) === 0)
    applyConfig(machine, config)
}

async function refreshConfig(machine: string) {
  const version = configSaves.get(machine)?.version
  try {
    const info = await call(machine, 'config.get', undefined)
    const save = configSaves.get(machine)
    if (save !== undefined && save.writes === 0 && save.version === version)
      applyConfig(machine, info.config)
  } catch (error) {
    showError(error)
  }
}

function applyConfig(machine: string, config: Config) {
  if (!getState().machines.some((item) => item.id === machine)) return
  setMachine(machine, { config })
  const selection = getState().selection
  if (selection === null || selection.machine !== machine) return
  const live =
    activityOf(getState().machines, machine, selection.sessionId) !== undefined
  if (live) return
  const settings =
    getDraftSettings(draftKey(selection)) ??
    providerSettings(
      config,
      selection.sessionId === null
        ? config.composer.provider
        : getState().settings.provider
    )
  const accountChanged = settings.accountId !== getState().settings.accountId
  update({ settings })
  if (accountChanged) void refreshCapabilities()
}
