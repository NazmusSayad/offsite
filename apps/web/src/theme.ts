import { schemes } from '@server/schemes'
import { getState } from './store'

export function currentScheme() {
  const theme = getState().config.theme
  const scheme = schemes.find((item) => item.id === theme)
  if (scheme === undefined) throw new Error(`unknown theme ${theme}`)
  return scheme
}

export function applyTheme() {
  const scheme = currentScheme()
  const style = document.documentElement.style
  style.setProperty('--bg', scheme.background)
  style.setProperty('--text', scheme.foreground)
  style.setProperty('--brand', scheme.palette[4])
  style.setProperty('--danger', scheme.palette[1])
  style.setProperty('--green', scheme.palette[2])
  style.setProperty('--yellow', scheme.palette[3])
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', scheme.background)
}
