import { router, type Search } from './router'
import { getState, type Selection } from './store'

export function currentSearch() {
  return router.parseLocation(router.history.location).search
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
    navigate({}, true, router.history.location.state.layer)
    return
  }
  const next = {
    machine: selection.machine,
    project: selection.projectId,
    session: selection.sessionId ?? undefined,
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
  void router.navigate({
    to: '/',
    search,
    replace,
    state: { layer },
    resetScroll: false,
  })
}
