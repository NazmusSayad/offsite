import type { Config } from '@offsite/core/config'
import { updateSkillRoots } from '../lib/codex/index.ts'
import { readConfig, saveConfig } from '../storage/config.ts'
import { publishAccounts, stopProvider } from './accounts.ts'
import { refreshAll, watchSessions } from './sessions.ts'

export async function saveSettings(params: Config) {
  const before = readConfig()
  const saved = saveConfig(params)
  for (const provider of ['claude', 'codex', 'opencode'] as const) {
    if (before[provider].enabled && !saved[provider].enabled) {
      await stopProvider(provider)
    }
  }
  if (saved.offsiteSkills !== before.offsiteSkills) {
    await updateSkillRoots()
    await stopProvider('opencode')
  }
  if (
    JSON.stringify(saved.claude.baseDir) ===
      JSON.stringify(before.claude.baseDir) &&
    saved.claude.enabled === before.claude.enabled &&
    saved.codex.enabled === before.codex.enabled &&
    saved.opencode.enabled === before.opencode.enabled
  ) {
    return saved
  }
  watchSessions()
  refreshAll()
  void publishAccounts()
  return saved
}
