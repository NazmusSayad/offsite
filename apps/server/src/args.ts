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
  .option('--no-auth', 'Accept connections without pairing')
  .option('--no-pair', "Don't create a pairing code or print pairing links")
  .option('--pwa', 'Serve the web app as an installable app that works offline')
  .option(
    '--connect <addresses>',
    'Add this machine to the web app with these comma separated addresses; needs --no-auth'
  )
  .configureHelp({ showGlobalOptions: true })

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
  .description('Creates a pairing code for another browser and prints its link')
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

if (!options.auth && !options.pair) {
  program.error("error: --no-pair can't be used with --no-auth")
}

if (options.connect !== undefined && options.auth) {
  program.error('error: --connect needs --no-auth')
}

if (options.connect !== undefined && command === 'serve') {
  program.error("error: --connect can't be used with offsite serve")
}

const connect =
  options.connect === undefined
    ? null
    : options.connect.split(',').map((address) => {
        const url = URL.parse(address)
        if (
          url === null ||
          (url.protocol !== 'http:' && url.protocol !== 'https:')
        ) {
          return program.error(
            `error: --connect address ${address} needs http:// or https://, like https://example.com`
          )
        }
        return url.origin
      })

export const args = {
  ...options,
  dir: path.resolve(options.dir),
  command,
  name,
  connect,
}

export const serverDir = path.join(import.meta.dirname, '..')
