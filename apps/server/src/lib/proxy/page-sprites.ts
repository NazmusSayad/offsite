export const PAGE_SPRITES = String.raw`  const sprites = new Map()
  const spriteIds = new Set()
  let spriteHost = null
  function loadSprite(file) {
    if (!sprites.has(file)) {
      sprites.set(file, realFetch(absolute(file)).then(function (response) {
        return response.text()
      }).then(function (text) {
        return new DOMParser().parseFromString(text, 'image/svg+xml')
      }))
    }
    return sprites.get(file)
  }
  function fixUse(element, name, value) {
    if (value.startsWith('#offsite-sprite-')) return
    const url = URL.parse(value, baseUrl())
    const hash = url === null ? '' : url.hash
    if (url !== null) url.hash = ''
    if (url === null || hash === '' || url.href === pageUrl().split('#')[0]) {
      useLinks.delete(element)
      if (native.get.call(element, name) !== value) native.set.call(element, name, value)
      return
    }
    const id = decodeURIComponent(hash.slice(1))
    const file = url.href
    loadSprite(file)
    const local = 'offsite-sprite-' + Array.from(sprites.keys()).indexOf(file) + '-' + id
    useLinks.set(element, value)
    native.set.call(element, name, '#' + local)
    if (spriteIds.has(local)) return
    spriteIds.add(local)
    loadSprite(file).then(function (sprite) {
      const source = sprite.getElementById(id)
      if (source === null) return
      const copy = document.importNode(source, true)
      copy.id = local
      if (spriteHost === null) {
        spriteHost = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        spriteHost.setAttribute('aria-hidden', 'true')
        spriteHost.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
        document.body.appendChild(spriteHost)
      }
      spriteHost.appendChild(copy)
    })
  }`
