import { schemes } from '@offsite/core/schemes'
import { getState, useStore } from './store'

export function currentScheme() {
  const theme = getState().prefs.theme
  const scheme = schemes.find((item) => item.id === theme)
  if (scheme === undefined) {
    throw new Error(`unknown theme ${theme}`)
  }
  return scheme
}

export function useCodeTheme() {
  const theme = useStore((state) => state.prefs.theme)
  const scheme = schemes.find((item) => item.id === theme)
  if (scheme === undefined) {
    throw new Error(`unknown theme ${theme}`)
  }
  return scheme.codeTheme
}

export function applyTheme() {
  const scheme = currentScheme()
  const style = document.documentElement.style
  style.setProperty('--bg', scheme.background)
  style.setProperty('--text', scheme.foreground)
  style.setProperty('--blue', scheme.palette[4])
  style.setProperty('--danger', scheme.palette[1])
  style.setProperty('--green', scheme.palette[2])
  style.setProperty('--yellow', scheme.palette[3])
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', scheme.background)
}
