import {
  Cancel01Icon,
  GithubIcon,
  Loading03Icon,
  LockIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitHubRepo } from '@offsite/core/project-setup'
import { useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { homePath } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { type MachineProject, machineOf, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

export function GitHubDialog(props: {
  machine: string
  folder: string
  onClone: (project: MachineProject) => void
}) {
  const home = useStore(
    (state) => machineOf(state, props.machine).system?.homeDir ?? null
  )
  const [mine, setMine] = useState<GitHubRepo[] | null>(null)
  const [found, setFound] = useState<{
    query: string
    repos: GitHubRepo[]
  } | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const text = query.trim().toLowerCase()
  const matches =
    mine?.filter((repo) => repo.name.toLowerCase().includes(text)) ?? []
  const more =
    text === '' || found?.query !== text
      ? []
      : found.repos.filter((repo) =>
          matches.every((match) => match.name !== repo.name)
        )
  const repos = [...matches, ...more]
  const current = repos.find((repo) => repo.name === selected) ?? repos[0]
  const searching = text !== '' && found?.query !== text && error === null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await call(props.machine, 'github.repos', { query: '' })
        if (!cancelled) {
          setMine(next)
        }
      } catch (failure) {
        if (!cancelled) {
          setError(errorMessage(failure))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.machine])

  useEffect(() => {
    if (text === '') {
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const next = await call(props.machine, 'github.repos', { query: text })
        if (!cancelled) {
          setFound({ query: text, repos: next })
        }
      } catch (failure) {
        if (!cancelled) {
          setError(errorMessage(failure))
        }
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [props.machine, text])

  async function clone() {
    if (current === undefined || cloning) {
      return
    }
    setCloning(true)
    setError(null)
    try {
      props.onClone({
        ...(await call(props.machine, 'github.clone', {
          repo: current.name,
          parent: props.folder,
        })),
        machine: props.machine,
      })
    } catch (failure) {
      setError(errorMessage(failure))
      setCloning(false)
    }
  }

  function move(step: number) {
    if (current === undefined) {
      return
    }
    const next =
      repos[
        Math.min(Math.max(repos.indexOf(current) + step, 0), repos.length - 1)
      ]
    setSelected(next.name)
    list.current
      ?.querySelector(`[data-repo="${CSS.escape(next.name)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <>
      <DialogTitle className="sr-only">Clone from GitHub</DialogTitle>
      <div className="flex h-11 items-center gap-2.5 border-b pr-1 pl-3">
        <HugeiconsIcon
          icon={GithubIcon}
          className="text-muted-foreground size-4 flex-none"
        />
        <input
          aria-label="Search repositories"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
          spellCheck={false}
          placeholder="Search repositories"
          value={query}
          disabled={cloning}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(null)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              move(event.key === 'ArrowDown' ? 1 : -1)
            }
            if (event.key === 'Enter') {
              void clone()
            }
          }}
        />
        {searching && (
          <HugeiconsIcon
            icon={Loading03Icon}
            className="text-muted-foreground size-4 flex-none animate-spin"
          />
        )}
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </DialogClose>
      </div>
      <div ref={list} className="h-80 overflow-y-auto p-1">
        {mine === null && error === null && (
          <p className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-4 animate-spin"
            />
            Loading repositories
          </p>
        )}
        {repos.map((repo) => (
          <div key={repo.name}>
            {repo === more[0] && matches.length > 0 && (
              <p className="text-muted-foreground px-2.5 pt-3 pb-1 text-xs">
                More on GitHub
              </p>
            )}
            <button
              data-repo={repo.name}
              disabled={cloning}
              className={cn(
                'hover:bg-muted flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors disabled:cursor-default',
                current === repo && 'bg-muted'
              )}
              onClick={() => setSelected(repo.name)}
              onDoubleClick={() => clone()}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span className="text-muted-foreground">
                    {repo.name.split('/')[0]}/
                  </span>
                  <span className="font-medium">{repo.name.split('/')[1]}</span>
                </span>
                {repo.description !== null && (
                  <span className="text-muted-foreground block truncate text-xs">
                    {repo.description}
                  </span>
                )}
              </span>
              {repo.private && (
                <HugeiconsIcon
                  icon={LockIcon}
                  aria-label="Private"
                  className="text-muted-foreground size-3.5 flex-none"
                />
              )}
            </button>
          </div>
        ))}
        {mine !== null && repos.length === 0 && !searching && (
          <p className="text-muted-foreground grid h-full place-items-center text-sm">
            No repositories found
          </p>
        )}
      </div>
      {error !== null && (
        <p className="text-destructive border-t px-3 py-2 text-sm break-all">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t p-3">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          Into{' '}
          <span className="font-mono">
            {home === null ? props.folder : homePath(props.folder, home)}
          </span>
        </p>
        <Button disabled={current === undefined || cloning} onClick={clone}>
          {cloning && (
            <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
          )}
          Clone
        </Button>
      </div>
    </>
  )
}
