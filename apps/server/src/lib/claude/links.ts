import { execFile } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { LinkAction, LinkEntry, LinkPlan } from '@offsite/core/providers'
import { claudeBaseDir } from '../../storage/config.ts'

const run = promisify(execFile)

const shared: Pick<LinkEntry, 'type' | 'name' | 'required'>[] = [
  { type: 'folder', name: 'projects', required: true },
  { type: 'folder', name: 'sessions', required: true },
  { type: 'folder', name: 'session-env', required: true },
  { type: 'folder', name: 'shell-snapshots', required: true },
  { type: 'folder', name: 'paste-cache', required: true },
  { type: 'folder', name: 'plans', required: true },
  { type: 'folder', name: 'tasks', required: true },
  { type: 'folder', name: 'jobs', required: true },
  { type: 'folder', name: 'cache', required: true },
  { type: 'folder', name: 'state', required: true },
  { type: 'folder', name: 'plugins', required: true },
  { type: 'folder', name: 'skills', required: true },
  { type: 'folder', name: 'file-history', required: true },
  { type: 'folder', name: 'agents', required: true },
  { type: 'folder', name: 'commands', required: true },
  { type: 'folder', name: 'output-styles', required: true },
  { type: 'jsonl', name: 'history.jsonl', required: true },
  { type: 'json', name: 'settings.json', required: true },
  { type: 'md', name: 'CLAUDE.md', required: true },
  { type: 'folder', name: 'teams', required: false },
  { type: 'json', name: 'keybindings.json', required: false },
]

type Step =
  | { type: 'unlink'; path: string }
  | { type: 'rmdir'; path: string }
  | { type: 'move'; from: string; to: string }
  | { type: 'link'; path: string; target: string; folder: boolean }

export function isLinked(configDir: string) {
  const base = claudeBaseDir()
  return (
    sameFile(configDir, base) ||
    shared
      .filter((item) => item.required)
      .every((item) =>
        sameFile(path.join(configDir, item.name), path.join(base, item.name))
      )
  )
}

export function isFullyLinked(configDir: string) {
  if (sameFile(configDir, claudeBaseDir())) {
    return true
  }
  return linkPlan(configDir).entries.every(
    (item) => item.action === 'linked' || item.action === 'skip'
  )
}

export function linkPlan(configDir: string): LinkPlan {
  const base = path.resolve(claudeBaseDir())
  const dir = statSync(configDir, { throwIfNoEntry: false })
  if (dir === undefined || !dir.isDirectory()) {
    throw new Error(`${configDir} does not exist`)
  }
  if (sameFile(configDir, base)) {
    throw new Error(`${configDir} is the main Claude folder`)
  }
  return {
    configDir,
    baseDir: base,
    entries: shared.map((item) => entry(configDir, base, item)),
  }
}

export async function linkClaude(configDir: string) {
  const plan = linkPlan(configDir)
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-')
  const steps = plan.entries.flatMap((item) => entrySteps(plan, item, stamp))
  if (steps.length === 0) {
    return
  }
  for (const item of plan.entries) {
    if (item.createInBase) {
      createInBase(path.join(plan.baseDir, item.name), item.type)
    }
  }
  if (process.platform === 'win32' && !canSymlink()) {
    await runElevated(steps)
  } else {
    for (const step of steps) {
      runStep(step)
    }
  }
  const missing = plan.entries.filter(
    (item) =>
      item.action !== 'skip' &&
      !sameFile(
        path.join(plan.configDir, item.name),
        path.join(plan.baseDir, item.name)
      )
  )
  if (missing.length > 0) {
    throw new Error(
      `Could not link ${missing.map((item) => item.name).join(', ')}`
    )
  }
}

function entry(
  configDir: string,
  base: string,
  item: Pick<LinkEntry, 'type' | 'name' | 'required'>
): LinkEntry {
  const target = path.join(configDir, item.name)
  const source = path.join(base, item.name)
  const missing = statSync(source, { throwIfNoEntry: false }) === undefined
  return {
    ...item,
    action: !item.required && missing ? 'skip' : entryAction(target, source),
    createInBase: item.required && missing,
  }
}

function createInBase(file: string, type: LinkEntry['type']) {
  switch (type) {
    case 'folder':
      mkdirSync(file, { recursive: true })
      return
    case 'json':
      writeFileSync(file, '{}\n', { flag: 'wx' })
      return
    case 'jsonl':
    case 'md':
      writeFileSync(file, '', { flag: 'wx' })
  }
}

function entryAction(target: string, source: string): LinkAction {
  const existing = lstatSync(target, { throwIfNoEntry: false })
  if (existing === undefined) {
    return 'link'
  }
  if (sameFile(target, source)) {
    return 'linked'
  }
  if (existing.isSymbolicLink()) {
    return 'relink'
  }
  if (existing.isDirectory() && readdirSync(target).length === 0) {
    return 'replace'
  }
  return 'backup'
}

function entrySteps(plan: LinkPlan, item: LinkEntry, stamp: string): Step[] {
  const target = path.join(plan.configDir, item.name)
  const link: Step = {
    type: 'link',
    path: target,
    target: path.join(plan.baseDir, item.name),
    folder: item.type === 'folder',
  }
  switch (item.action) {
    case 'linked':
    case 'skip':
      return []
    case 'link':
      return [link]
    case 'relink':
      return [{ type: 'unlink', path: target }, link]
    case 'replace':
      return [{ type: 'rmdir', path: target }, link]
    case 'backup': {
      const backup = `${target}.backup-${stamp}`
      if (lstatSync(backup, { throwIfNoEntry: false }) !== undefined) {
        throw new Error(`${backup} already exists`)
      }
      return [{ type: 'move', from: target, to: backup }, link]
    }
  }
}

function sameFile(first: string, second: string) {
  const firstStats = statSync(first, { bigint: true, throwIfNoEntry: false })
  const secondStats = statSync(second, { bigint: true, throwIfNoEntry: false })
  if (firstStats === undefined || secondStats === undefined) {
    return false
  }
  return (
    firstStats.dev === secondStats.dev && firstStats.ino === secondStats.ino
  )
}

function canSymlink() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'offsite-'))
  const link = path.join(dir, 'link')
  try {
    symlinkSync(dir, link, 'dir')
  } catch (error) {
    rmdirSync(dir)
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return false
    }
    throw error
  }
  unlinkSync(link)
  rmdirSync(dir)
  return true
}

function runStep(step: Step) {
  switch (step.type) {
    case 'unlink':
      unlinkSync(step.path)
      return
    case 'rmdir':
      rmdirSync(step.path)
      return
    case 'move':
      renameSync(step.from, step.to)
      return
    case 'link':
      symlinkSync(step.target, step.path, step.folder ? 'dir' : 'file')
  }
}

async function runElevated(steps: Step[]) {
  const user = await run('whoami', ['/user', '/fo', 'csv', '/nh'])
  const sid = user.stdout.trim().split(',').at(-1)?.replaceAll('"', '')
  if (sid === undefined || !sid.startsWith('S-1-')) {
    throw new Error(`Could not read your Windows user: ${user.stdout}`)
  }
  const owner = `*${sid}`
  const dir = mkdtempSync(path.join(os.tmpdir(), 'offsite-'))
  const errorFile = path.join(dir, 'error.txt')
  const script = `const fs = require('node:fs')
const childProcess = require('node:child_process')
const data = ${JSON.stringify({ steps, owner, errorFile })}
try {
  for (const step of data.steps) {
    if (step.type === 'unlink') fs.unlinkSync(step.path)
    if (step.type === 'rmdir') fs.rmdirSync(step.path)
    if (step.type === 'move') fs.renameSync(step.from, step.to)
    if (step.type === 'link') {
      fs.symlinkSync(step.target, step.path, step.folder ? 'dir' : 'file')
      childProcess.execFileSync('icacls', [step.path, '/setowner', data.owner, '/L', '/Q'])
    }
  }
} catch (error) {
  fs.writeFileSync(data.errorFile, error.message)
  process.exit(1)
}`
  const code = `eval(Buffer.from('${Buffer.from(script).toString('base64')}','base64').toString())`
  try {
    await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ProgressPreference = 'SilentlyContinue'; try { $process = Start-Process -FilePath ${quote(process.execPath)} -ArgumentList '-e',${quote(code)} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }; exit $process.ExitCode`,
    ])
  } catch (error) {
    if (existsSync(errorFile)) {
      throw new Error(readFileSync(errorFile, 'utf8'))
    }
    if (
      error instanceof Error &&
      'stderr' in error &&
      typeof error.stderr === 'string' &&
      error.stderr.trim() !== ''
    ) {
      throw new Error(`Windows admin permission failed: ${error.stderr.trim()}`)
    }
    throw error
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}
