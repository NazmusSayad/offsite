import { execFile } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { serverDir } from '../../args.ts'
import { scriptFile, serviceDir } from './settings.ts'

const run = promisify(execFile)
const NAME = 'offsite'

const unitFile = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
  'systemd',
  'user',
  `${NAME}.service`
)
const launcherSource = path.join(
  serverDir,
  'src',
  'services',
  'service',
  'macos',
  'offsite.app'
)
const launcher = path.join(serviceDir, 'offsite.app')
const launcherProgram = path.join(launcher, 'Contents', 'MacOS', 'offsite')
const plistFile = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${NAME}.plist`
)

export async function register() {
  switch (process.platform) {
    case 'linux':
      return registerLinux()
    case 'darwin':
      return registerMac()
    case 'win32':
      return registerWindows()
    default:
      throw new Error(`offsite install doesn't support ${process.platform}`)
  }
}

export async function unregister() {
  switch (process.platform) {
    case 'linux':
      return unregisterLinux()
    case 'darwin':
      return unregisterMac()
    case 'win32':
      return unregisterWindows()
    default:
      throw new Error(`offsite uninstall doesn't support ${process.platform}`)
  }
}

async function registerLinux() {
  try {
    await run('loginctl', ['enable-linger'])
  } catch {
    console.warn(
      `Could not keep offsite running after logout; run: sudo loginctl enable-linger ${os.userInfo().username}`
    )
  }
  mkdirSync(path.dirname(unitFile), { recursive: true })
  writeFileSync(
    unitFile,
    [
      '[Unit]',
      'Description=offsite',
      '',
      '[Service]',
      `ExecStart=/bin/sh "${scriptFile.replaceAll('%', '%%')}"`,
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n')
  )
  await systemctl(['daemon-reload'])
  await systemctl(['enable', `${NAME}.service`])
  await systemctl(['restart', `${NAME}.service`])
}

async function unregisterLinux() {
  if (!existsSync(unitFile)) {
    return
  }
  await systemctl(['disable', '--now', `${NAME}.service`])
  rmSync(unitFile)
  await systemctl(['daemon-reload'])
}

function systemctl(commandArguments: string[]) {
  return run('systemctl', ['--user', ...commandArguments], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR:
        process.env.XDG_RUNTIME_DIR ?? `/run/user/${os.userInfo().uid}`,
    },
  })
}

async function registerMac() {
  rmSync(launcher, { recursive: true, force: true })
  cpSync(launcherSource, launcher, { recursive: true })
  chmodSync(launcherProgram, 0o755)
  mkdirSync(path.dirname(plistFile), { recursive: true })
  writeFileSync(
    plistFile,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      `  <key>Label</key><string>${NAME}</string>`,
      '  <key>ProgramArguments</key>',
      `  <array><string>${escapeXml(launcherProgram)}</string><string>${escapeXml(scriptFile)}</string></array>`,
      '  <key>RunAtLoad</key><true/>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n')
  )
  await run('launchctl', ['bootstrap', macDomain(), plistFile])
}

async function unregisterMac() {
  if (!existsSync(plistFile)) {
    return
  }
  if (await succeeds('launchctl', ['print', `${macDomain()}/${NAME}`])) {
    await run('launchctl', ['bootout', `${macDomain()}/${NAME}`])
  }
  rmSync(plistFile)
}

function macDomain() {
  return `gui/${os.userInfo().uid}`
}

async function registerWindows() {
  const user =
    process.env.USERDOMAIN === undefined
      ? os.userInfo().username
      : `${process.env.USERDOMAIN}\\${os.userInfo().username}`
  const xml = [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <Triggers>',
    `    <LogonTrigger><Enabled>true</Enabled><UserId>${escapeXml(user)}</UserId></LogonTrigger>`,
    '  </Triggers>',
    '  <Principals>',
    `    <Principal id="Author"><UserId>${escapeXml(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal>`,
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <Priority>5</Priority>',
    '    <Enabled>true</Enabled>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    '      <Command>conhost.exe</Command>',
    `      <Arguments>--headless powershell.exe -ExecutionPolicy Bypass -File "${escapeXml(scriptFile)}"</Arguments>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    '',
  ].join('\r\n')
  const file = path.join(os.tmpdir(), `offsite-task-${process.pid}.xml`)
  writeFileSync(file, `﻿${xml}`, 'utf16le')
  try {
    await run('schtasks', ['/create', '/tn', NAME, '/xml', file, '/f'])
  } finally {
    rmSync(file)
  }
  await run('schtasks', ['/run', '/tn', NAME])
}

async function unregisterWindows() {
  if (await succeeds('schtasks', ['/query', '/tn', NAME])) {
    await succeeds('schtasks', ['/end', '/tn', NAME])
    await run('schtasks', ['/delete', '/tn', NAME, '/f'])
  }
  const script = scriptFile.replaceAll("'", "''")
  await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains('${script}') } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }`,
  ])
}

async function succeeds(command: string, commandArguments: string[]) {
  try {
    await run(command, commandArguments)
    return true
  } catch {
    return false
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
