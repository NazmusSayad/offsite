import { execFileSync } from 'node:child_process'
import { spawn } from '@lydell/node-pty'
const pty = spawn(
  '/bin/bash',
  ['--noprofile', '--norc', '-c', `exec -l ${process.env.SHELL}`],
  { cwd: process.env.HOME, env: process.env }
)
setTimeout(() => pty.write('cd /tmp\r'), 1500)
setTimeout(() => {
  console.log(
    execFileSync('lsof', [
      '-a',
      '-d',
      'cwd',
      '-p',
      String(pty.pid),
      '-Fn',
    ]).toString()
  )
  pty.kill()
  process.exit(0)
}, 3000)
