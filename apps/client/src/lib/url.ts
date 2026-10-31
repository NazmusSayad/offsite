import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { useParams, useSearch } from '@tanstack/react-router'
import { router, type Search } from './router'
import { getState, projectOf, type Selection, useStore } from './store'

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
  }
}

export function replaceSearch(next: Search) {
  navigate(
    { ...currentSearch(), ...next },
    true,
    router.history.location.state.layer
  )
}

export function pushSearch(next: Search, layer: 'chat' | 'overlay') {
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

export function leaveLayer(layer: 'chat' | 'overlay', fallback: () => void) {
  if (router.history.location.state.layer === layer) {
    router.history.back()
    return
  }
  fallback()
}

export function syncUrl() {
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
  const next = {
    machine: selection.machine,
    project: selection.projectId,
    session: selection.sessionId ?? undefined,
  }
  if (terminalPage() !== null) {
    void router.navigate({
      to: '/',
      search: next,
      state: { layer: 'chat' },
      resetScroll: false,
    })
    return
  }
  if (currentSearch().machine === undefined) {
    pushSearch(next, 'chat')
    return
  }
  replaceSearch(next)
}

function navigate(
  search: Search,
  replace: boolean,
  layer: 'chat' | 'overlay' | undefined
) {
  const machine = terminalPage()
  if (machine !== null) {
    void router.navigate({
      to: '/terminal/$machine',
      params: { machine },
      search,
      replace,
      state: { layer },
      resetScroll: false,
    })
    return
  }
  void router.navigate({
    to: '/',
    search,
    replace,
    state: { layer },
    resetScroll: false,
  })
}
