import type {
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-agent-sdk'

export function permissionResult(
  input: Record<string, unknown>,
  suggestions: PermissionUpdate[],
  decision: 'allow' | 'always' | 'deny',
  answers: Record<string, string> | null
): PermissionResult {
  switch (decision) {
    case 'allow':
      return {
        behavior: 'allow',
        updatedInput: answers === null ? input : { ...input, answers },
      }
    case 'always':
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: suggestions,
      }
    case 'deny':
      return {
        behavior: 'deny',
        message: 'The user rejected this action',
        interrupt: true,
      }
  }
}
