import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { useMatchRoute, useParams, useSearch } from '@tanstack/react-router'
import { useEffect, useEffectEvent } from 'react'
import { router, type Search } from './router'
import { getState, projectOf, type Selection, useStore } from './store'
import { wide } from './utils'

export function currentSearch() {
  return router.parseLocation(router.history.location).search
}

export function terminalPage() {
  const match = /^\/terminal\/([^/]+)$/.exec(router.history.location.pathname)
  if (match === null) {
    return null
  }
  const machine = decodeURIComponent(match[1])
  return getState().machines.some((item) => item.id === machine)
    ? machine
    : null
}

export function useTerminalPage() {
  const machine = useParams({
    strict: false,
    select: (params) => params.machine ?? null,
  })
  return useStore((state) =>
    state.machines.some((item) => item.id === machine) ? machine : null
  )
}

export function activityPage() {
  return router.history.location.pathname === '/activity'
}

export function useActivityPage() {
  return useMatchRoute()({ to: '/activity' }) !== false
}

export function terminalView() {
  return currentSearch().project ?? GLOBAL_TERMINALS
}

export function useTerminalView() {
  return useSearch({
    strict: false,
    select: (search) => search.project ?? GLOBAL_TERMINALS,
  })
}

export function selectionFromUrl(machines: string[]): Selection | null {
  const search = currentSearch()
  if (
    search.machine === undefined ||
    search.project === undefined ||
    !machines.includes(search.machine)
  ) {
    return null
  }
  return {
    machine: search.machine,
    projectId: search.project,
    sessionId: search.session ?? null,
    pending: null,
  }
}

export function replaceSearch(next: Search) {
  navigate(
    { ...currentSearch(), ...next },
    true,
    router.history.location.state.layer
  )
}

export function pushSearch(next: Search, layer: 'overlay' | undefined) {
  navigate({ ...currentSearch(), ...next }, false, layer)
}

export function openBrowser(target: string) {
  const state = getState()
  if (state.selection === null) {
    throw new Error('no project is open to show the browser in')
  }
  if (target.startsWith('file:')) {
    replaceSearch({
      panel: 'browser',
      browse: decodeURIComponent(new URL(target).pathname),
    })
    return
  }
  if (
    /^https?:\/\//i.test(target) ||
    target.startsWith('/') ||
    /^[a-z]:[\\/]/i.test(target)
  ) {
    replaceSearch({ panel: 'browser', browse: target })
    return
  }
  const project = projectOf(
    state,
    state.selection.machine,
    state.selection.projectId
  )
  if (project === undefined) {
    throw new Error(`project ${state.selection.projectId} is not listed`)
  }
  replaceSearch({ panel: 'browser', browse: `${project.path}/${target}` })
}

const pullRequestPattern =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/

export function isPullRequestUrl(href: string) {
  return pullRequestPattern.test(href)
}

export function openPullRequest(href: string) {
  const match = pullRequestPattern.exec(href)
  if (match === null) {
    throw new Error(`${href} is not a GitHub pull request link`)
  }
  const url = `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`
  if (getState().selection === null) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  pushSearch(
    { panel: 'pulls', pull: url },
    wide.matches ? undefined : 'overlay'
  )
}

const layers: Array<() => void> = []
let leaving = false
let guarded = false
let poppedGuard = false

export function onGuard() {
  return router.history.location.state.guard === true
}

export function leftGuard() {
  return poppedGuard
}

function reconcileGuard() {
  if (leaving) {
    return
  }
  if (layers.length > 0 && !onGuard()) {
    router.history.push(router.history.location.href, { guard: true })
    return
  }
  if (layers.length === 0 && onGuard()) {
    leaving = true
    router.history.back()
  }
}

export function startGuard() {
  guarded = onGuard()
  router.history.subscribe(({ action }) => {
    const was = guarded
    guarded = onGuard()
    if (action.type === 'PUSH' || action.type === 'REPLACE') {
      poppedGuard = false
      return
    }
    poppedGuard = was
    if (poppedGuard && leaving) {
      leaving = false
    } else if (poppedGuard) {
      layers.at(-1)?.()
    }
    setTimeout(reconcileGuard)
  })
  setTimeout(reconcileGuard)
}

export function useCloseOnBack(open: boolean, onBack: () => void) {
  const back = useEffectEvent(onBack)

  useEffect(() => {
    if (!open) {
      return
    }
    function layer() {
      back()
    }
    layers.push(layer)
    setTimeout(reconcileGuard)
    return () => {
      layers.splice(layers.indexOf(layer), 1)
      setTimeout(reconcileGuard)
    }
  }, [open])
}

const terminalProjectsKey = 'terminalProjects'

function terminalProjects(): string[] {
  return JSON.parse(localStorage.getItem(terminalProjectsKey) ?? '[]')
}

export function rememberTerminal() {
  const search = currentSearch()
  if (
    terminalPage() !== null ||
    search.machine === undefined ||
    search.project === undefined ||
    search.session === undefined
  ) {
    return
  }
  const key = `${search.machine} ${search.project}`
  const others = terminalProjects().filter((item) => item !== key)
  localStorage.setItem(
    terminalProjectsKey,
    JSON.stringify(search.bottom === 'terminal' ? [...others, key] : others)
  )
}

export function syncUrl(replace = false) {
  const selection = getState().selection
  if (selection === null) {
    navigate(
      {
        project: terminalPage() === null ? undefined : currentSearch().project,
      },
      true,
      router.history.location.state.layer
    )
    return
  }
  const search = currentSearch()
  const fromDraft =
    search.machine === selection.machine &&
    search.project === selection.projectId &&
    search.session === undefined &&
    (selection.sessionId === null || getState().loaded)
  const remembered = terminalProjects().includes(
    `${selection.machine} ${selection.projectId}`
  )
  const next = {
    machine: selection.machine,
    project: selection.projectId,
    session: selection.sessionId ?? undefined,
    bottom: fromDraft
      ? search.bottom
      : selection.sessionId !== null && remembered
        ? ('terminal' as const)
        : undefined,
  }
  if (terminalPage() !== null || activityPage()) {
    void router.navigate({
      to: '/',
      search: next,
      replace: replace || onGuard(),
      resetScroll: false,
    })
    return
  }
  const sameSession =
    search.machine === next.machine &&
    search.project === next.project &&
    search.session === next.session
  const draftToDraft =
    search.machine !== undefined &&
    search.session === undefined &&
    next.session === undefined
  if (replace || sameSession || fromDraft || draftToDraft) {
    replaceSearch(next)
    return
  }
  pushSearch(next, undefined)
}

function navigate(
  search: Search,
  replace: boolean,
  layer: 'overlay' | undefined
) {
  const machine = terminalPage()
  const guard = onGuard()
  const state = replace && guard ? { layer, guard } : { layer }
  if (machine !== null) {
    void router.navigate({
      to: '/terminal/$machine',
      params: { machine },
      search,
      replace: replace || guard,
      state,
      resetScroll: false,
    })
    return
  }
  if (activityPage()) {
    void router.navigate({
      to: '/activity',
      search,
      replace: replace || guard,
      state,
      resetScroll: false,
    })
    return
  }
  void router.navigate({
    to: '/',
    search,
    replace: replace || guard,
    state,
    resetScroll: false,
  })
}
