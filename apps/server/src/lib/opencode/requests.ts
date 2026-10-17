import type { Item, PermissionRequest } from '@offsite/core/items'
import type { PermissionRequest as OpenCodePermission } from '@opencode/client'

export function permissionRequest(
  permission: OpenCodePermission,
  item: Item | undefined
): PermissionRequest {
  return {
    id: permission.id,
    kind: 'approval',
    title:
      permission.message ??
      `Allow ${permission.action} ${permission.resources.join(', ')}?`,
    canAlwaysAllow: (permission.save ?? []).length > 0,
    item: item ?? {
      id: permission.id,
      parent: null,
      time: Date.now(),
      kind: 'tool',
      name: permission.action,
      input: { resources: permission.resources },
      output: '',
      status: 'running',
    },
  }
}
