import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createSecureContext } from 'node:tls'
import { z } from 'zod'
import { logger } from '../lib/log.ts'
import { home, readJson, writeJson } from '../storage/storage.ts'

const file = path.join(home, 'https.json')
const log = logger.withTag('https')
const savedFiles = z.object({ cert: z.string(), key: z.string() }).nullable()

export function loadHttps() {
  try {
    const files = savedFiles.parse(readJson('https.json'))
    if (files === null) {
      return null
    }
    return readFiles(files)
  } catch (error) {
    const message = `offsite couldn't use the HTTPS settings in ${file}; fix them or run offsite https-rm: ${error instanceof Error ? error.message : error}`
    console.error(message)
    log.error(message)
    process.exit(1)
  }
}

export function saveHttps(files: { cert: string; key: string }) {
  try {
    readFiles(files)
  } catch (error) {
    console.error(
      `offsite couldn't use ${files.cert} and ${files.key}: ${error instanceof Error ? error.message : error}`
    )
    process.exit(1)
  }
  writeJson('https.json', files)
  console.log(
    `offsite serves HTTPS with ${files.cert} and ${files.key} from its next start`
  )
}

export function removeHttps() {
  if (!existsSync(file)) {
    console.log("offsite doesn't serve HTTPS")
    return
  }
  rmSync(file)
  console.log('offsite serves HTTP from its next start')
}

function readFiles(files: { cert: string; key: string }) {
  const tls = { cert: readFileSync(files.cert), key: readFileSync(files.key) }
  createSecureContext(tls)
  return tls
}
