import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Command, Option } from '@commander-js/extra-typings'
import { z } from 'zod'

let command = 'web' as
  | 'web'
  | 'serve'
  | 'pair'
  | 'unpair'
  | 'install'
  | 'uninstall'
  | 'status'
  | 'update'
let name = null as string | null

export const SERVICE_PORT = '2020'

export const version = (process.env.OFFSITE_VERSION ?? 'dev').replace(/^v/, '')

const program = new Command('offsite')
  .description('Starts the server and the web app')
  .version(version)
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
  .addOption(new Option('--service <dir>').hideHelp())
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

program
  .command('install')
  .description(
    `Starts offsite at login with these options, on port ${SERVICE_PORT} unless you pass --port`
  )
  .action(() => {
    command = 'install'
  })

program
  .command('uninstall')
  .description('Stops offsite from starting at login and updating itself')
  .action(() => {
    command = 'uninstall'
  })

program
  .command('update')
  .description(
    'Updates offsite with the package manager the service uses, then restarts the service'
  )
  .action(() => {
    command = 'update'
  })

program
  .command('status')
  .description('Shows whether offsite is running, and if it is idle or busy')
  .action(() => {
    command = 'status'
  })

const serviceAt = process.argv.indexOf('--service')

program.parse(
  serviceAt === -1
    ? process.argv
    : [
        ...process.argv.slice(0, 2),
        ...savedArguments(process.argv[serviceAt + 1]),
        ...process.argv.slice(2),
      ]
)

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

const portGiven = program.getOptionValueSource('port') === 'cli'

export const args = {
  ...options,
  dir: path.resolve(
    options.service === undefined ? options.dir : options.service
  ),
  command,
  name,
  connect,
  portGiven,
  service: options.service !== undefined,
  pair: options.pair && options.service === undefined,
  serverArguments: [
    ...(program.getOptionValueSource('host') === 'cli'
      ? ['--host', options.host]
      : []),
    ...(options.auth ? [] : ['--no-auth']),
    ...(options.pwa === true ? ['--pwa'] : []),
    ...(options.connect === undefined ? [] : ['--connect', options.connect]),
  ],
}

export const serverDir = path.join(import.meta.dirname, '..')

function savedArguments(dir: string | undefined) {
  if (dir === undefined) {
    console.error('--service needs the offsite folder')
    process.exit(1)
  }
  const file = path.resolve(dir, 'service', 'settings.json')
  try {
    return z
      .object({ arguments: z.array(z.string()) })
      .parse(JSON.parse(readFileSync(file, 'utf8'))).arguments
  } catch (error) {
    console.error(
      `offsite couldn't read the arguments in ${file}:`,
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}
