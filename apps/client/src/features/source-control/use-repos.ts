import type { SourceControlRepo } from '@offsite/core/git'
import { isEqual } from 'es-toolkit'
import { useEffect, useEffectEvent, useState } from 'react'
import { call } from '@/api/connection'
import { errorMessage } from '@/lib/utils'

const STATUS_REFRESH = 3000

export function useRepos(props: {
  machine: string
  projectId: string
  version: number
  onLoaded: () => void
}) {
  const [repos, setRepos] = useState<SourceControlRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loaded = useEffectEvent(props.onLoaded)

  useEffect(() => {
    let live = true
    let loading = false
    async function load() {
      if (loading) {
        return
      }
      loading = true
      try {
        const result = await call(props.machine, 'git.changes', {
          projectId: props.projectId,
        })
        if (!live) {
          return
        }
        setError(null)
        setRepos((previous) => (isEqual(previous, result) ? previous : result))
        loaded()
      } catch (caught) {
        if (live) {
          setError(errorMessage(caught))
        }
      } finally {
        loading = false
      }
    }
    function poll() {
      if (!document.hidden) {
        void load()
      }
    }
    void load()
    const timer = window.setInterval(poll, STATUS_REFRESH)
    window.addEventListener('focus', poll)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener('focus', poll)
    }
  }, [props.machine, props.projectId, props.version])

  return { repos, error }
}
