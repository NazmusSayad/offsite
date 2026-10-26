import { useEffect, useEffectEvent } from 'react'
import { call } from '@/api/connection'
import {
  type Block,
  type monaco,
  registerBlockAction,
  revertBlock,
} from '@/features/files/monaco'
import type { TabSpec } from '@/features/source-control/changes'

export function useBlockStaging(props: {
  machine: string
  projectId: string
  spec: TabSpec | undefined
  original: monaco.editor.ITextModel | null
  modified: monaco.editor.ITextModel | null
  onPerform: (task: () => Promise<unknown>) => Promise<void>
}) {
  const staging = stagingTarget(props.spec)
  const stagingKind = staging?.kind ?? null

  const writeBlock = useEffectEvent((block: Block) => {
    const spec = props.spec
    const original = props.original
    const modified = props.modified
    if (
      spec === undefined ||
      staging === null ||
      original === null ||
      modified === null
    ) {
      throw new Error('This diff has no blocks to stage')
    }
    void props.onPerform(() =>
      call(props.machine, 'git.run', {
        projectId: props.projectId,
        repo: spec.repo,
        action: {
          kind: 'stageContent',
          path: staging.path,
          content:
            staging.kind === 'stage'
              ? block.originalWithModifiedChanges
              : revertBlock(original, modified, block.mapping),
        },
      })
    )
  })

  useEffect(() => {
    if (stagingKind === null) {
      return
    }
    return registerBlockAction(stagingKind, writeBlock)
  }, [stagingKind])
}

function stagingTarget(
  spec: TabSpec | undefined
): { kind: 'stage' | 'unstage'; path: string } | null {
  if (
    spec?.left?.kind === 'git' &&
    spec.left.ref === '' &&
    spec.right.kind === 'worktree'
  ) {
    return { kind: 'stage', path: spec.left.path }
  }
  if (
    spec?.left?.kind === 'git' &&
    spec.right.kind === 'git' &&
    spec.right.ref === ''
  ) {
    return { kind: 'unstage', path: spec.right.path }
  }
  return null
}
