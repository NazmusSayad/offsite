type PageConfig = {
  key: string
  url: string
  cookies: string
  storage: Record<string, string>
  origin: string | null
}

export function pageScript(config: PageConfig) {
  const json = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `(${PAGE_SCRIPT})(${json})`
}

const PAGE_SCRIPT = String.raw`function (config) {
  if (self.__ol) return
  const inWindow = typeof document !== 'undefined'
  const realLocation = self.location
  const origin = config.origin ?? realLocation.origin
  const prefix = '/api/proxy/' + config.key + '/'
  const realFetch = self.fetch.bind(self)
  const native = { get: inWindow && Element.prototype.getAttribute, set: inWindow && Element.prototype.setAttribute }
  const realPost = inWindow && window.postMessage.bind(window)
  const panel = inWindow && window.parent !== window && window.parent === window.top ? window.parent : null
  const skipped = /^\s*(data|blob|javascript|about|mailto|tel|sms|file):/i
  const schemes = { 'http:': 'http', 'https:': 'https', 'ws:': 'http', 'wss:': 'https' }

  function hide(name, value) {
    Object.defineProperty(self, name, { value, enumerable: false, configurable: true, writable: true })
  }
  function decode(value) {
    const text = String(value)
    const index = text.indexOf(prefix)
    if (index === -1 || (index !== 0 && !text.startsWith(origin))) return null
    const rest = text.slice(index + prefix.length)
    const slash = rest.indexOf('/')
    const scheme = rest.slice(0, slash)
    if (scheme !== 'http' && scheme !== 'https') return null
    return scheme + '://' + rest.slice(slash + 1)
  }
  function original(value) {
    return decode(value) ?? value
  }
  function pageUrl() {
    return decode(realLocation.href) ?? config.url
  }
  function baseUrl() {
    const base = inWindow && document.querySelector('base[href]')
    return base ? (decode(native.get.call(base, 'href')) ?? pageUrl()) : pageUrl()
  }
  function encode(value, base) {
    const text = String(value)
    if (text === '' || text.startsWith('#') || skipped.test(text) || decode(text) !== null) return text
    const url = URL.parse(text, base ?? baseUrl())
    if (url === null || schemes[url.protocol] === undefined) return text
    return prefix + schemes[url.protocol] + '/' + url.host + url.pathname + url.search + url.hash
  }
  function absolute(value) {
    const encoded = encode(value)
    return encoded.startsWith('/') ? origin + encoded : encoded
  }
  function encodeSet(value) {
    return String(value).split(/,\s+/).map(function (item) {
      const parts = item.trim().split(/\s+/)
      parts[0] = encode(parts[0])
      return parts.join(' ')
    }).join(', ')
  }
  function socketUrl(value) {
    return (origin.startsWith('https') ? 'wss://' : 'ws://') + origin.replace(/^https?:\/\//, '') + encode(value)
  }
  function postPanel(message) {
    if (panel) panel.postMessage(Object.assign({ offsite: 'browser' }, message), '*')
  }
  function navigate(value, replace) {
    const next = URL.parse(String(value), baseUrl())
    if (next === null) return
    const web = next.protocol === 'http:' || next.protocol === 'https:'
    if (panel && web && next.host !== new URL(pageUrl()).host) {
      postPanel({ event: 'open', url: next.href })
      return
    }
    if (replace) realLocation.replace(encode(next.href))
    else realLocation.assign(encode(next.href))
  }

  const fakeLocation = {}
  for (const part of ['href', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin']) {
    Object.defineProperty(fakeLocation, part, {
      enumerable: true,
      get() {
        return new URL(pageUrl())[part]
      },
      set(value) {
        if (part === 'origin') return
        if (part === 'hash') {
          realLocation.hash = value
          return
        }
        if (part === 'href') {
          navigate(value)
          return
        }
        const next = new URL(pageUrl())
        next[part] = value
        navigate(next.href)
      },
    })
  }
  fakeLocation.assign = function (value) { navigate(value) }
  fakeLocation.replace = function (value) { navigate(value, true) }
  fakeLocation.reload = function () { realLocation.reload() }
  fakeLocation.toString = function () { return pageUrl() }
  fakeLocation.valueOf = function () { return fakeLocation }
  fakeLocation[Symbol.toPrimitive] = function () { return pageUrl() }
  fakeLocation.ancestorOrigins = []

  function pageTop() {
    if (!inWindow || window.parent === window) return self
    let current = window
    while (current.parent !== window.top) current = current.parent
    return current
  }
  hide('__ol', function (value) { return value === realLocation ? fakeLocation : value })
  hide('__ow', function (value) {
    if (!inWindow) return value
    if (value === window.top) return pageTop()
    return value
  })
  hide('__ou', function (current, value) {
    if (current === realLocation || (inWindow && current === window.top.location)) return encode(value)
    return value
  })
  hide('__oi', function (value) {
    const text = String(value)
    return /^(\/|https?:)/.test(text) ? absolute(text) : text
  })
  hide('__om', original)

  function patch(owner, name, wrap) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name)
    if (descriptor === undefined) return
    Object.defineProperty(owner, name, Object.assign({}, descriptor, wrap(descriptor)))
  }
  function getter(owner, name, read) {
    patch(owner, name, function (descriptor) {
      return { get() { return read(descriptor.get.call(this), this) } }
    })
  }

  self.fetch = function (input, init) {
    const options = Object.assign({}, init, { credentials: 'omit' })
    if (options.mode === 'same-origin') options.mode = 'cors'
    if (input instanceof RealRequest) return realFetch(input, options)
    return realFetch(absolute(input), options)
  }
  const RealRequest = self.Request
  self.Request = class Request extends RealRequest {
    constructor(input, init) {
      super(input instanceof RealRequest ? input : absolute(input), init)
    }
  }
  getter(RealRequest.prototype, 'url', original)
  getter(Response.prototype, 'url', original)
  const realOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    const rest = Array.prototype.slice.call(arguments, 2)
    return realOpen.call(this, method, encode(url), ...rest)
  }
  patch(XMLHttpRequest.prototype, 'withCredentials', function () {
    return { get() { return false }, set() {} }
  })
  getter(XMLHttpRequest.prototype, 'responseURL', original)
  self.WebSocket = new Proxy(self.WebSocket, {
    construct(target, args) {
      args[0] = socketUrl(args[0])
      return Reflect.construct(target, args)
    },
  })
  if (self.EventSource) {
    self.EventSource = new Proxy(self.EventSource, {
      construct(target, args) {
        return new target(encode(args[0]))
      },
    })
  }
  function workerUrl(value, options) {
    const text = String(value)
    if (skipped.test(text)) return text
    const target = URL.parse(text, baseUrl())
    if (target === null) return text
    const runtime = origin + prefix + 'runtime.js?url=' + encodeURIComponent(target.href) + '&origin=' + encodeURIComponent(origin)
    const script = absolute(target.href)
    const code = options && options.type === 'module'
      ? 'import ' + JSON.stringify(runtime) + ';import ' + JSON.stringify(script) + ';'
      : 'importScripts(' + JSON.stringify(runtime) + ');importScripts(' + JSON.stringify(script) + ');'
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  }
  for (const name of ['Worker', 'SharedWorker']) {
    if (self[name]) {
      self[name] = new Proxy(self[name], {
        construct(target, args) {
          args[0] = workerUrl(args[0], args[1])
          return Reflect.construct(target, args)
        },
      })
    }
  }
  if (!inWindow) {
    if (self.importScripts) {
      const realImport = self.importScripts.bind(self)
      self.importScripts = function () {
        realImport(...Array.from(arguments, function (item) { return absolute(item) }))
      }
    }
    return
  }

  delete Navigator.prototype.serviceWorker
  Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: {
      keys() { return Promise.resolve([]) },
      has() { return Promise.resolve(false) },
      delete() { return Promise.resolve(false) },
      match() { return Promise.resolve(undefined) },
      open() { return Promise.reject(new DOMException('Cache storage is off', 'SecurityError')) },
    },
  })
  Object.defineProperty(Navigator.prototype, 'locks', {
    configurable: true,
    value: {
      request(name, options, callback) {
        const run = callback ?? options
        return Promise.resolve().then(function () { return run({ name, mode: 'exclusive' }) })
      },
      query() { return Promise.resolve({ held: [], pending: [] }) },
    },
  })
  const blankFrames = new Proxy(window, {
    get(target, name) {
      if (name === 'document') throw new DOMException('Helper frames are blocked', 'SecurityError')
      const value = Reflect.get(target, name)
      return typeof value === 'function' && value.prototype === undefined ? value.bind(target) : value
    },
  })
  getter(HTMLIFrameElement.prototype, 'contentWindow', function (value, frame) {
    const blank = native.get.call(frame, 'src') === null && native.get.call(frame, 'srcdoc') === null
    return blank && value !== null ? blankFrames : value
  })
  const realBeacon = navigator.sendBeacon.bind(navigator)
  navigator.sendBeacon = function (url, data) { return realBeacon(encode(url), data) }

  const properties = [
    [HTMLAnchorElement, 'href'], [HTMLAreaElement, 'href'], [HTMLLinkElement, 'href'], [HTMLBaseElement, 'href'],
    [HTMLImageElement, 'src'], [HTMLScriptElement, 'src'], [HTMLIFrameElement, 'src'], [HTMLMediaElement, 'src'],
    [HTMLSourceElement, 'src'], [HTMLEmbedElement, 'src'], [HTMLInputElement, 'src'], [HTMLTrackElement, 'src'],
    [HTMLFormElement, 'action'], [HTMLButtonElement, 'formAction'], [HTMLInputElement, 'formAction'],
    [HTMLObjectElement, 'data'], [HTMLVideoElement, 'poster'],
  ]
  for (const item of properties) {
    patch(item[0].prototype, item[1], function (descriptor) {
      return {
        get() { return original(descriptor.get.call(this)) },
        set(value) { descriptor.set.call(this, encode(value)) },
      }
    })
  }
  const RealAudio = window.Audio
  window.Audio = function Audio(source) {
    return source === undefined ? new RealAudio() : new RealAudio(encode(source))
  }
  window.Audio.prototype = RealAudio.prototype
  for (const owner of [HTMLImageElement, HTMLSourceElement]) {
    patch(owner.prototype, 'srcset', function (descriptor) {
      return {
        get() { return descriptor.get.call(this) },
        set(value) { descriptor.set.call(this, encodeSet(value)) },
      }
    })
  }
  for (const owner of [HTMLScriptElement, HTMLLinkElement]) {
    patch(owner.prototype, 'integrity', function () {
      return { get() { return '' }, set() {} }
    })
  }
  for (const part of ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin']) {
    for (const owner of [HTMLAnchorElement, HTMLAreaElement]) {
      getter(owner.prototype, part, function (value, element) {
        const url = URL.parse(element.href)
        return url === null ? value : url[part]
      })
    }
  }

  const linkTags = new Set(['A', 'AREA', 'AUDIO', 'BASE', 'BUTTON', 'EMBED', 'FORM', 'IFRAME', 'IMG', 'INPUT', 'LINK', 'OBJECT', 'SCRIPT', 'SOURCE', 'TRACK', 'VIDEO'])
  const linkNames = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data'])
  Element.prototype.setAttribute = function (name, value) {
    const lower = String(name).toLowerCase()
    if (lower === 'integrity' || lower === 'crossorigin') return
    if (linkNames.has(lower) && linkTags.has(this.tagName)) {
      native.set.call(this, name, encode(value))
      return
    }
    if (lower === 'srcset') {
      native.set.call(this, name, encodeSet(value))
      return
    }
    native.set.call(this, name, value)
  }
  Element.prototype.getAttribute = function (name) {
    const value = native.get.call(this, name)
    if (value === null) return null
    const url = decode(value)
    if (url === null) return value
    const parsed = URL.parse(url)
    if (parsed === null || parsed.origin !== new URL(pageUrl()).origin) return url
    return parsed.pathname + parsed.search + parsed.hash
  }
  function encodeSelector(selector) {
    return String(selector).replace(/\[(src|href)(\^?=)(["']?)([^"'\]]+)\3\]/g, function (match, name, operator, quote, value) {
      if (!/^(\/|https?:\/\/)/.test(value)) return match
      return '[' + name + operator + '"' + encode(value) + '"]'
    })
  }
  for (const owner of [Document, DocumentFragment, Element]) {
    for (const name of ['querySelector', 'querySelectorAll']) {
      const realQuery = owner.prototype[name]
      owner.prototype[name] = function (selector) {
        return realQuery.call(this, encodeSelector(selector))
      }
    }
  }
  for (const name of ['matches', 'closest']) {
    const realMatch = Element.prototype[name]
    Element.prototype[name] = function (selector) {
      return realMatch.call(this, encodeSelector(selector))
    }
  }
  function encodeCss(text) {
    return String(text).replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, function (match, quote, url) {
      return 'url(' + quote + encode(url) + quote + ')'
    })
  }
  for (const name of ['insertRule', 'replace', 'replaceSync']) {
    const realRule = CSSStyleSheet.prototype[name]
    CSSStyleSheet.prototype[name] = function (text, index) {
      return realRule.call(this, encodeCss(text), index)
    }
  }
  function fixElement(element) {
    const style = native.get.call(element, 'style')
    if (style !== null) {
      const next = encodeCss(style)
      if (next !== style) native.set.call(element, 'style', next)
    }
    if (element.tagName === 'STYLE') {
      const text = element.textContent
      const next = encodeCss(text)
      if (next !== text) element.textContent = next
      return
    }
    if (!linkTags.has(element.tagName)) return
    for (const name of linkNames) {
      const value = native.get.call(element, name)
      if (value !== null) {
        const next = encode(value)
        if (next !== value) native.set.call(element, name, next)
      }
    }
    const set = native.get.call(element, 'srcset')
    if (set !== null && !set.includes(prefix)) native.set.call(element, 'srcset', encodeSet(set))
  }
  new MutationObserver(function (records) {
    for (const record of records) {
      if (record.type === 'attributes' || record.target.nodeName === 'STYLE') fixElement(record.target)
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        fixElement(node)
        for (const child of node.querySelectorAll('[src],[href],[action],[srcset],[poster],[data],[style],style')) fixElement(child)
      }
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })

  getter(Document.prototype, 'URL', pageUrl)
  getter(Document.prototype, 'documentURI', pageUrl)
  getter(Node.prototype, 'baseURI', baseUrl)
  getter(Document.prototype, 'referrer', original)
  patch(Document.prototype, 'domain', function () {
    return { get() { return new URL(pageUrl()).hostname }, set() {} }
  })
  Object.defineProperty(window, 'origin', { get() { return new URL(pageUrl()).origin }, configurable: true })
  getter(MessageEvent.prototype, 'origin', function (value) {
    return value === 'null' ? new URL(pageUrl()).origin : value
  })
  window.postMessage = function (message, target, transfer) {
    if (typeof target === 'object' && target !== null) return realPost(message, Object.assign({}, target, { targetOrigin: '*' }))
    return realPost(message, '*', transfer)
  }

  const cookies = new Map()
  for (const item of config.cookies.split('; ')) {
    const index = item.indexOf('=')
    if (index > 0) cookies.set(item.slice(0, index), item.slice(index + 1))
  }
  patch(Document.prototype, 'cookie', function () {
    return {
      get() { return Array.from(cookies, function (item) { return item[0] + '=' + item[1] }).join('; ') },
      set(value) {
        const text = String(value)
        const pair = text.split(';')[0]
        const index = pair.indexOf('=')
        const name = pair.slice(0, index).trim()
        const age = /;\s*max-age=(-?\d+)/i.exec(text)
        const expires = /;\s*expires=([^;]+)/i.exec(text)
        const gone = (age && Number(age[1]) <= 0) || (expires && Date.parse(expires[1]) <= Date.now())
        if (gone) cookies.delete(name)
        else cookies.set(name, pair.slice(index + 1).trim())
        realFetch(prefix + 'cookie', { method: 'POST', body: JSON.stringify({ url: pageUrl(), cookie: text }) })
      },
    }
  })

  function storageArea(initial, save) {
    const data = new Map(Object.entries(initial))
    const area = {
      getItem(name) { return data.has(String(name)) ? data.get(String(name)) : null },
      setItem(name, value) { data.set(String(name), String(value)); save(data) },
      removeItem(name) { data.delete(String(name)); save(data) },
      clear() { data.clear(); save(data) },
      key(index) { return Array.from(data.keys())[index] ?? null },
      get length() { return data.size },
    }
    return new Proxy(area, {
      get(target, name) {
        if (name in target) return Reflect.get(target, name)
        return typeof name === 'string' ? data.get(name) : undefined
      },
      set(target, name, value) { target.setItem(name, value); return true },
      deleteProperty(target, name) { target.removeItem(name); return true },
      has(target, name) { return name in target || data.has(name) },
      ownKeys() { return Array.from(data.keys()) },
      getOwnPropertyDescriptor(target, name) {
        return data.has(name) ? { value: data.get(name), enumerable: true, configurable: true, writable: true } : undefined
      },
    })
  }
  let saveTimer = null
  let pending = null
  function sendStorage(keepalive) {
    if (pending === null) return
    const body = JSON.stringify({ origin: new URL(pageUrl()).origin, data: pending })
    pending = null
    realFetch(prefix + 'storage', { method: 'POST', body, keepalive: keepalive && body.length < 60000 })
  }
  const local = storageArea(config.storage, function (data) {
    pending = Object.fromEntries(data)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(function () { sendStorage(false) }, 50)
  })
  const session = storageArea({}, function () {})
  Object.defineProperty(window, 'localStorage', { get() { return local }, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { get() { return session }, configurable: true })
  addEventListener('pagehide', function () { sendStorage(true) })

  function report(replaced) {
    postPanel({ event: 'location', url: pageUrl(), replaced: replaced === true })
  }
  for (const name of ['pushState', 'replaceState']) {
    const realHistory = History.prototype[name]
    History.prototype[name] = function (state, title, url) {
      const result = realHistory.call(this, state, title, url === undefined || url === null ? url : encode(url))
      report(name === 'replaceState')
      return result
    }
  }
  const realWindowOpen = window.open
  window.open = function (url, target, features) {
    if (url === undefined || url === null || url === '') return realWindowOpen.call(window, url, target, features)
    if (features) return realWindowOpen.call(window, encode(url), target, features)
    navigate(url)
    return window
  }
  if (panel === null) return
  report()
  addEventListener('popstate', report)
  addEventListener('hashchange', report)
  addEventListener('pageshow', report)
  addEventListener('pagehide', function () { postPanel({ event: 'loading' }) })
  addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (anchor === null || anchor.hasAttribute('download')) return
    const next = URL.parse(anchor.href)
    if (next === null || !/^https?:$/.test(next.protocol)) return
    if (next.host === new URL(pageUrl()).host) return
    event.preventDefault()
    navigate(next.href)
  })
  addEventListener('message', function (event) {
    if (event.source !== panel || !event.data || event.data.offsite !== 'browser') return
    event.stopImmediatePropagation()
    if (event.data.command === 'back') history.back()
    if (event.data.command === 'forward') history.forward()
    if (event.data.command === 'reload') realLocation.reload()
  })
}`
