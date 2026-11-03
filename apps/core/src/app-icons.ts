export const appIcons = [
  { id: 'original', name: 'Original', scale: 1, tile: null },
  { id: 'small', name: 'Small', scale: 0.7, tile: null },
  {
    id: 'dark',
    name: 'Dark',
    scale: 0.7,
    tile: { color: '#0a0a0a', shape: 'rounded' },
  },
  {
    id: 'light',
    name: 'Light',
    scale: 0.7,
    tile: { color: '#ffffff', shape: 'rounded' },
  },
  {
    id: 'dark-circle',
    name: 'Dark circle',
    scale: 0.62,
    tile: { color: '#0a0a0a', shape: 'circle' },
  },
  {
    id: 'light-circle',
    name: 'Light circle',
    scale: 0.62,
    tile: { color: '#ffffff', shape: 'circle' },
  },
  {
    id: 'dark-square',
    name: 'Dark square',
    scale: 0.7,
    tile: { color: '#0a0a0a', shape: 'square' },
  },
  {
    id: 'light-square',
    name: 'Light square',
    scale: 0.7,
    tile: { color: '#ffffff', shape: 'square' },
  },
] as const

export type AppIconId = (typeof appIcons)[number]['id']
