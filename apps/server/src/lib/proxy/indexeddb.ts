import { readdirSync, readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

let script: string | null = null

export function serveIndexedDb(response: ServerResponse) {
  script ??= bundle()
  response.setHeader('content-type', 'text/javascript; charset=utf-8')
  response.setHeader('cache-control', 'private, max-age=86400')
  response.end(script)
}

function bundle() {
  const root = path.dirname(
    createRequire(import.meta.url).resolve('fake-indexeddb')
  )
  const modules = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const name = JSON.stringify(file.split(path.sep).join('/'))
      const source = readFileSync(path.join(root, file), 'utf8')
      return `${name}: function (module, exports, require) {\n${source}\n}`
    })
  return `const modules = {
${modules.join(',\n')}
}
const loaded = {}
function resolve(from, request) {
  const parts = from.split('/').slice(0, -1)
  for (const part of request.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}
function load(name) {
  if (loaded[name]) return loaded[name].exports
  if (!modules[name]) throw new Error('fake-indexeddb has no ' + name)
  const module = { exports: {} }
  loaded[name] = module
  modules[name](module, module.exports, function (request) { return load(resolve(name, request)) })
  return module.exports
}
return load('index.js')
`
}
