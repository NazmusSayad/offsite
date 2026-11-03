const CACHE = 'offsite-worker'
const FILES = [
  { path: '/icon-192.png', size: 192, maskable: false },
  { path: '/icon-512.png', size: 512, maskable: false },
  { path: '/icon-maskable-512.png', size: 512, maskable: true },
]

export const appIcons: {
  id: string
  name: string
  scale: number
  tile: { color: string; shape: 'square' | 'rounded' | 'circle' } | null
}[] = [
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
]

export function appIcon() {
  return localStorage.getItem('appIcon') ?? 'original'
}

export async function setAppIcon(id: string) {
  const icon = appIcons.find((item) => item.id === id)
  if (icon === undefined) {
    throw new Error(`unknown app icon ${id}`)
  }
  const cache = await caches.open(CACHE)
  if (icon.id === 'original') {
    await Promise.all(FILES.map((file) => cache.delete(file.path)))
  } else {
    const logo = new Image(512, 512)
    logo.src = '/icon.svg'
    await logo.decode()
    for (const file of FILES) {
      await cache.put(
        file.path,
        new Response(await renderIcon(logo, icon, file.size, file.maskable), {
          headers: { 'content-type': 'image/png' },
        })
      )
    }
  }
  localStorage.setItem('appIcon', icon.id)
  await showFavicon()
}

export async function showFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (link === null) {
    throw new Error('the favicon link is missing')
  }
  if (link.href.startsWith('blob:')) {
    URL.revokeObjectURL(link.href)
  }
  if (appIcon() === 'original') {
    link.type = 'image/svg+xml'
    link.href = '/icon.svg'
    return
  }
  const icon = await (await caches.open(CACHE)).match('/icon-192.png')
  if (icon === undefined) {
    throw new Error('the app icon is missing')
  }
  link.type = 'image/png'
  link.href = URL.createObjectURL(await icon.blob())
}

async function renderIcon(
  logo: HTMLImageElement,
  icon: (typeof appIcons)[number],
  size: number,
  maskable: boolean
) {
  const canvas = new OffscreenCanvas(size, size)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('the browser cannot draw the icon')
  }
  if (icon.tile !== null) {
    context.fillStyle = icon.tile.color
    context.beginPath()
    if (maskable || icon.tile.shape === 'square') {
      context.rect(0, 0, size, size)
    } else if (icon.tile.shape === 'rounded') {
      context.roundRect(0, 0, size, size, size * 0.22)
    } else if (icon.tile.shape === 'circle') {
      context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    } else {
      throw new Error(`unknown tile shape ${icon.tile.shape}`)
    }
    context.fill()
  }
  const logoSize = size * (maskable ? Math.min(icon.scale, 0.56) : icon.scale)
  context.drawImage(
    logo,
    (size - logoSize) / 2,
    (size - logoSize) / 2,
    logoSize,
    logoSize
  )
  return await canvas.convertToBlob({ type: 'image/png' })
}
