import { createHash } from 'node:crypto'
import { MagicString } from 'magic-string'
import { parseSync } from 'oxc-parser'

type Node = Record<string, unknown> & {
  type: string
  start: number
  end: number
}

type Parent = { node: Node; field: string; parent: Parent | null } | null

type Context = {
  source: string
  output: MagicString
  rewrite: (url: string) => string
}

const CACHE_LIMIT = 500
const MARKERS = /\b(?:location|top|parent|import)\b/
const WINDOWS = new Set(['window', 'self', 'globalThis', 'frames'])
const FUNCTIONS = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])
const PATTERNS = new Set([
  'ObjectPattern',
  'ArrayPattern',
  'RestElement',
  'AssignmentPattern',
  'Property',
])
const NAMES = new Set([
  'ImportSpecifier',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
  'ExportSpecifier',
  'LabeledStatement',
  'BreakStatement',
  'ContinueStatement',
])
const KEYS = new Set(['Property', 'MethodDefinition', 'PropertyDefinition'])
const cache = new Map<string, string>()

export function rewriteScript(
  source: string,
  rewrite: (url: string) => string,
  scope: string
) {
  if (!MARKERS.test(source)) {
    return source
  }
  const id = createHash('sha1').update(scope).update(source).digest('base64')
  const known = cache.get(id)
  if (known !== undefined) {
    return known
  }
  const rewritten = rewriteSource(source, rewrite)
  if (cache.size >= CACHE_LIMIT) {
    cache.clear()
  }
  cache.set(id, rewritten)
  return rewritten
}

export function rewriteHandler(
  source: string,
  rewrite: (url: string) => string
) {
  const open = 'function handler(event){'
  const close = '\n}'
  const rewritten = rewriteSource(`${open}${source}${close}`, rewrite)
  return rewritten.slice(open.length, rewritten.length - close.length)
}

function rewriteSource(source: string, rewrite: (url: string) => string) {
  const parsed = parseSync('page.js', source, {
    lang: 'js',
    sourceType: 'unambiguous',
  })
  if (parsed.errors.some((error) => error.severity === 'Error')) {
    return source
  }
  const output = new MagicString(source)
  walk(parsed.program as unknown as Node, null, false, {
    source,
    output,
    rewrite,
  })
  return output.toString()
}

function walk(node: Node, parent: Parent, binding: boolean, context: Context) {
  visit(node, parent, binding, context)
  for (const field of Object.keys(node)) {
    const value = node[field]
    const position = { node, field, parent }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          walk(item, position, inBinding(node, field, binding), context)
        }
      }
    } else if (isNode(value)) {
      walk(value, position, inBinding(node, field, binding), context)
    }
  }
}

function visit(node: Node, parent: Parent, binding: boolean, context: Context) {
  const output = context.output
  if (
    (node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration') &&
    isNode(node.source)
  ) {
    const specifier = String(node.source.value)
    if (specifier.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(specifier)) {
      output.overwrite(
        node.source.start,
        node.source.end,
        JSON.stringify(context.rewrite(specifier))
      )
    }
    return
  }
  if (node.type === 'ImportExpression' && isNode(node.source)) {
    wrap(output, node.source, '__oi')
    return
  }
  if (node.type === 'AssignmentExpression') {
    if (
      node.operator === '=' &&
      isNode(node.left) &&
      isNode(node.right) &&
      isLocationTarget(node.left)
    ) {
      const current = context.source.slice(node.left.start, node.left.end)
      output.appendRight(node.right.start, `__ou(${current},`)
      output.appendLeft(node.right.end, ')')
    }
    return
  }
  if (node.type === 'Identifier') {
    visitIdentifier(node, parent, binding, output)
    return
  }
  if (node.type === 'MemberExpression' && !binding) {
    visitMember(node, parent, output)
  }
}

function visitIdentifier(
  node: Node,
  parent: Parent,
  binding: boolean,
  output: MagicString
) {
  const name = String(node.name)
  if (name !== 'location' && name !== 'top' && name !== 'parent') {
    return
  }
  const wrapper = name === 'location' ? '__ol' : '__ow'
  if (
    parent?.node.type === 'Property' &&
    parent.field === 'value' &&
    parent.node.shorthand === true &&
    !binding
  ) {
    output.appendRight(node.start, `${name}:${wrapper}(`)
    output.appendLeft(node.end, ')')
    return
  }
  if (binding || !isRead(node, parent)) {
    return
  }
  wrap(output, node, wrapper)
}

function visitMember(node: Node, parent: Parent, output: MagicString) {
  if (!isNode(node.property) || !isNode(node.object)) {
    return
  }
  if (node.computed === true) {
    return
  }
  const name = String(node.property.name)
  if (
    name === 'url' &&
    node.object.type === 'MetaProperty' &&
    isRead(node, parent)
  ) {
    wrap(output, node, '__om')
    return
  }
  if (name === 'location' && isRead(node, parent) && !insideChain(parent)) {
    wrap(output, node, '__ol')
    return
  }
  if (
    (name === 'top' || name === 'parent') &&
    node.object.type === 'Identifier' &&
    WINDOWS.has(String(node.object.name)) &&
    isRead(node, parent) &&
    !insideChain(parent)
  ) {
    wrap(output, node, '__ow')
  }
}

function isRead(node: Node, parent: Parent) {
  if (parent === null) {
    return true
  }
  const owner = parent.node
  const field = parent.field
  if (owner.type === 'MemberExpression' && field === 'property') {
    return owner.computed === true
  }
  if (KEYS.has(owner.type) && field === 'key') {
    return owner.computed === true
  }
  if (NAMES.has(owner.type)) {
    return false
  }
  if (owner.type === 'CallExpression' && field === 'callee') {
    return false
  }
  if (owner.type === 'UpdateExpression') {
    return false
  }
  if (owner.type === 'AssignmentExpression' && field === 'left') {
    return false
  }
  if (owner.type === 'UnaryExpression') {
    return owner.operator !== 'delete' && owner.operator !== 'typeof'
  }
  return true
}

function inBinding(node: Node, field: string, binding: boolean) {
  if (node.type === 'VariableDeclarator') {
    return field === 'id'
  }
  if (FUNCTIONS.has(node.type)) {
    return field === 'params' || field === 'id'
  }
  if (node.type === 'ClassExpression' || node.type === 'ClassDeclaration') {
    return field === 'id'
  }
  if (node.type === 'CatchClause') {
    return field === 'param'
  }
  if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
    return field === 'left'
  }
  if (node.type === 'AssignmentExpression') {
    return field === 'left'
  }
  if (node.type === 'AssignmentPattern' && field === 'right') {
    return false
  }
  if (node.type === 'Property' && field === 'key') {
    return false
  }
  return binding && PATTERNS.has(node.type)
}

function isLocationTarget(node: Node) {
  if (node.type === 'Identifier') {
    return node.name === 'location'
  }
  return (
    node.type === 'MemberExpression' &&
    node.computed !== true &&
    isNode(node.property) &&
    node.property.name === 'location'
  )
}

function insideChain(parent: Parent) {
  return (
    parent !== null &&
    parent.node.type === 'MemberExpression' &&
    parent.field === 'object' &&
    hasChain(parent)
  )
}

function hasChain(parent: Parent): boolean {
  if (parent === null) {
    return false
  }
  if (parent.node.type === 'ChainExpression') {
    return true
  }
  return hasChain(parent.parent)
}

function wrap(output: MagicString, node: Node, name: string) {
  output.appendRight(node.start, `${name}(`)
  output.appendLeft(node.end, ')')
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}
