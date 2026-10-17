import os from 'node:os'
import path from 'node:path'
import { Command } from '@commander-js/extra-typings'

let command = 'web' as 'web' | 'serve' | 'pair' | 'unpair'
let name = null as string | null

const program = new Command('offsite')
  .description('Starts the server and the web app')
  .option('--host <host>', 'Address to listen on', '127.0.0.1')
  .option('--port <port>', 'Port to listen on', '47841')
  .option(
    '--dir <dir>',
    'Folder for settings and accounts',
    path.join(os.homedir(), '.offsite')
  )
  .option('--no-auth', 'Accept connections without the pairing token')
  .option('--no-pair', "Don't create a pairing token or print pairing links")
  .option(
    '--fallback <url>',
    'Address to try when this one is unreachable, e.g. a Cloudflare tunnel'
  )

program
  .command('web', { isDefault: true })
  .description('Starts the server and the web app, same as offsite')

program
  .command('serve')
  .description('Starts only the server, without the web app')
  .action(() => {
    command = 'serve'
  })

program
  .command('pair')
  .description(
    'Creates a pairing token for another browser and prints its links'
  )
  .option('--name <name>', 'Name to recognize this browser by')
  .action((options) => {
    command = 'pair'
    name = options.name ?? null
  })

program
  .command('unpair')
  .description('Picks paired browsers to unpair')
  .action(() => {
    command = 'unpair'
  })

program.parse()

const options = program.opts()

export const args = {
  ...options,
  dir: path.resolve(options.dir),
  command,
  name,
}

export const serverDir = path.join(import.meta.dirname, '..')
