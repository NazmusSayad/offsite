import { randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { lstat, open, readdir, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { mediaTypes } from '@offsite/core/media'
import type { FilePreview } from '@offsite/core/projects'
import { isPaired } from '../storage/auth.ts'
import { hasCode, home } from '../storage/storage.ts'

const FILE_LIMIT = 20_000
const SNIFF_LENGTH = 8000
const OUTPUT_LIMIT = 256 * 1024
const READ_LIMIT = 1024 * 1024
const MEDIA_LINK_LIFETIME = 60 * 60_000
const BROWSE_LINK_LIFETIME = 60 * 60_000
const mediaLinks = new Map<
  string,
  {
    file: string
    mediaType: string
    device: string | null
    expiresAt: number
  }
>()
const browseLinks = new Map<
  string,
  {
    device: string | null
    address: string
    expiresAt: number
  }
>()
const skipped = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  'dist',
  'target',
  '.next',
  '__pycache__',
  '.venv',
])

export async function listFiles(cwd: string) {
  return (await listEntries(cwd)).files
}

export async function listEntries(cwd: string) {
  const files: string[] = []
  const folders: string[] = []
  const pending = ['']
  while (pending.length > 0 && files.length < FILE_LIMIT) {
    const dir = pending.pop() ?? ''
    let entries
    try {
      entries = await readdir(path.join(cwd, dir), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (skipped.has(entry.name)) {
        continue
      }
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        pending.push(relative)
        folders.push(relative)
      }
      if (entry.isFile()) {
        files.push(relative)
      }
      if (entry.isSymbolicLink()) {
        const target = await stat(path.join(cwd, relative)).catch(() => null)
        if (target?.isFile() === true) {
          files.push(relative)
        }
      }
    }
  }
  return { files: files.slice(0, FILE_LIMIT).sort(), folders: folders.sort() }
}

export function readProjectFile(cwd: string, file: string): FilePreview {
  const full = resolveProjectFile(cwd, file)
  const stats = statSync(full)
  if (!stats.isFile()) {
    throw new Error(`${file} is not a file`)
  }
  if (stats.size > READ_LIMIT) {
    return { kind: 'large', size: stats.size, limit: READ_LIMIT }
  }
  const data = readFileSync(full)
  const mediaType = mediaTypes.get(path.extname(full).toLowerCase())
  if (mediaType?.startsWith('image/') === true) {
    return {
      kind: 'image',
      size: stats.size,
      mediaType,
      data: data.toString('base64'),
    }
  }
  if (data.includes(0)) {
    return { kind: 'binary', size: stats.size }
  }
  return { kind: 'text', size: stats.size, content: data.toString('utf8') }
}

export function writeProjectFile(
  cwd: string,
  file: string,
  content: string,
  base: string | null
) {
  const full = resolveProjectFile(cwd, file)
  if (!statSync(full).isFile()) {
    throw new Error(`${file} is not a file`)
  }
  if (base !== null && readFileSync(full, 'utf8') !== base) {
    return false
  }
  writeFileSync(full, content)
  return true
}

export function createProjectEntry(cwd: string, file: string, folder: boolean) {
  const full = resolveNewProjectPath(cwd, file)
  if (folder) {
    mkdirSync(full, { recursive: true })
    return
  }
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, '', { flag: 'wx' })
}

export function renameProjectEntry(cwd: string, file: string, to: string) {
  const source = resolveProjectEntry(cwd, file)
  const target = resolveNewProjectPath(cwd, to)
  mkdirSync(path.dirname(target), { recursive: true })
  renameSync(source, target)
}

export function deleteProjectEntry(cwd: string, file: string) {
  rmSync(resolveProjectEntry(cwd, file), { recursive: true })
}

export function linkProjectMedia(
  cwd: string,
  file: string,
  device: string | null
) {
  const resolved = path.resolve(realpathSync(cwd), file)
  if (!existsSync(resolved)) {
    throw new Error(`${file} does not exist`)
  }
  const full = realpathSync(resolved)
  const mediaType = mediaTypes.get(path.extname(full).toLowerCase())
  if (mediaType === undefined) {
    throw new Error(`${file} is not an image, video or audio file`)
  }
  return addLink(full, mediaType, device)
}

export function linkProjectDownload(
  cwd: string,
  file: string,
  device: string | null
) {
  const full = resolveProjectFile(cwd, file)
  if (!statSync(full).isFile()) {
    throw new Error(`${file} is not a file`)
  }
  return addLink(full, 'application/octet-stream', device)
}

export function linkBrowse(device: string | null, address: string) {
  for (const [token, link] of browseLinks) {
    if (link.expiresAt <= Date.now()) {
      browseLinks.delete(token)
    }
  }
  const token = randomBytes(32).toString('base64url')
  browseLinks.set(token, {
    device,
    address,
    expiresAt: Date.now() + BROWSE_LINK_LIFETIME,
  })
  return token
}

export function canBrowse(token: string, address: string | undefined) {
  const link = browseLinks.get(token)
  if (
    link === undefined ||
    link.expiresAt <= Date.now() ||
    link.address !== address
  ) {
    return false
  }
  return link.device === null || isPaired(link.device)
}

export function setBrowseHeaders(
  response: ServerResponse,
  contentType: string
) {
  response.setHeader('content-type', contentType)
  response.setHeader('cache-control', 'no-cache')
  if (/^(text\/html|image\/svg|application\/xml)/.test(contentType)) {
    response.setHeader(
      'content-security-policy',
      'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads'
    )
  }
}

export function sniffType(file: string) {
  const head = Buffer.alloc(SNIFF_LENGTH)
  const handle = openSync(file, 'r')
  const read = readSync(handle, head, 0, SNIFF_LENGTH, 0)
  closeSync(handle)
  return head.subarray(0, read).includes(0)
    ? 'application/octet-stream'
    : 'text/plain; charset=utf-8'
}

export function streamFile(
  file: string,
  size: number,
  request: IncomingMessage,
  response: ServerResponse
) {
  response.setHeader('accept-ranges', 'bytes')
  if (request.headers.range === undefined) {
    response.setHeader('content-length', size)
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
    return
  }
  const range = byteRange(request.headers.range, size)
  if (range === null) {
    response.statusCode = 416
    response.setHeader('content-range', `bytes */${size}`)
    response.end()
    return
  }
  response.statusCode = 206
  response.setHeader(
    'content-range',
    `bytes ${range.start}-${range.end}/${size}`
  )
  response.setHeader('content-length', range.end - range.start + 1)
  createReadStream(file, range)
    .on('error', () => response.destroy())
    .pipe(response)
}

function byteRange(header: string, size: number) {
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(header)
  if (match === null) {
    return null
  }
  if (match[3] !== undefined) {
    if (size === 0 || Number(match[3]) === 0) {
      return null
    }
    return { start: Math.max(size - Number(match[3]), 0), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start > end) {
    return null
  }
  return { start, end }
}

function addLink(file: string, mediaType: string, device: string | null) {
  for (const [token, link] of mediaLinks) {
    if (link.expiresAt <= Date.now()) {
      mediaLinks.delete(token)
    }
  }
  const token = randomBytes(32).toString('base64url')
  mediaLinks.set(token, {
    file,
    mediaType,
    device,
    expiresAt: Date.now() + MEDIA_LINK_LIFETIME,
  })
  return token
}

export function findMediaLink(token: string | null) {
  if (token === null) {
    return null
  }
  const link = mediaLinks.get(token)
  if (link === undefined || link.expiresAt <= Date.now()) {
    return null
  }
  if (link.device !== null && !isPaired(link.device)) {
    return null
  }
  return link
}

export function saveUpload(name: string, data: Buffer) {
  const dir = path.join(home, 'uploads', randomUUID())
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, path.basename(name))
  writeFileSync(file, data)
  return file
}

export async function taskOutput(sessionId: string, file: string) {
  const tasks = path.dirname(file)
  if (
    !/^[\w-]+$/.test(sessionId) ||
    !path.isAbsolute(file) ||
    path.normalize(file) !== file ||
    !/^\w+\.output$/.test(path.basename(file)) ||
    path.basename(tasks) !== 'tasks' ||
    path.basename(path.dirname(tasks)) !== sessionId
  ) {
    throw new Error('Not a background task output file of this thread')
  }
  let stats
  try {
    stats = await lstat(file)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  if (!stats.isFile()) {
    throw new Error('Background task output is not a regular file')
  }
  const start = Math.max(0, stats.size - OUTPUT_LIMIT)
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(stats.size - start)
    const read = await handle.read(buffer, 0, buffer.length, start)
    return {
      text: buffer.subarray(0, read.bytesRead).toString('utf8'),
      truncated: start > 0,
    }
  } finally {
    await handle.close()
  }
}

function resolveProjectFile(cwd: string, file: string) {
  const root = realpathSync(cwd)
  const resolved = path.resolve(root, file)
  if (!existsSync(resolved)) {
    throw new Error(`${file} does not exist`)
  }
  const full = realpathSync(resolved)
  checkInProject(root, full, file)
  return full
}

function resolveProjectEntry(cwd: string, file: string) {
  const root = realpathSync(cwd)
  const resolved = path.resolve(root, file)
  if (!existsSync(path.dirname(resolved))) {
    throw new Error(`${file} does not exist`)
  }
  const full = path.join(
    realpathSync(path.dirname(resolved)),
    path.basename(resolved)
  )
  if (full === root) {
    throw new Error('The project folder itself cannot be changed')
  }
  checkInProject(root, full, file)
  lstatSync(full)
  return full
}

function resolveNewProjectPath(cwd: string, file: string) {
  const root = realpathSync(cwd)
  const resolved = path.resolve(root, file)
  if (existsSync(resolved)) {
    throw new Error(`${file} already exists`)
  }
  let existing = path.dirname(resolved)
  while (!existsSync(existing)) {
    existing = path.dirname(existing)
  }
  const full = path.join(
    realpathSync(existing),
    path.relative(existing, resolved)
  )
  checkInProject(root, full, file)
  return full
}

function checkInProject(root: string, full: string, file: string) {
  const relative = path.relative(root, full)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${file} is outside the project`)
  }
}
