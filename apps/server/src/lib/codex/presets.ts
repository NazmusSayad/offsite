import type { SessionSettings } from '@offsite/core/config'

const presets = new Map([
  [
    'read-only',
    {
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
    },
  ],
  [
    'auto',
    {
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
    },
  ],
  [
    'full-access',
    {
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
      sandboxPolicy: { type: 'dangerFullAccess' },
    },
  ],
])

export function threadPreset(settings: SessionSettings) {
  const preset = modePreset(settings.mode)
  if (preset === null) {
    return {}
  }
  return { approvalPolicy: preset.approvalPolicy, sandbox: preset.sandbox }
}

export function modePreset(mode: string | null) {
  if (mode === null) {
    return null
  }
  const preset = presets.get(mode)
  if (preset === undefined) {
    throw new Error(`Codex has no ${mode} mode`)
  }
  return preset
}
