import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  Account,
  Config,
  Platform,
  TerminalConfig,
  TerminalIdentity,
} from '@offsite/core/protocol'
import { shellIntegrationIssue } from '@offsite/core/shell-check'
import { useState } from 'react'
import { updateConfig } from '@/api/machine-config'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { platforms } from '@/features/terminal/config'
import { AgentsSection } from './agents'
import { Row, Section } from './controls'
import { GitSection } from './git'
import { ShellInput } from './shell-input'

export function MachinePage(props: {
  machine: string
  config: Config
  platform: Platform
  defaultShell: string
  claudeAccounts: Account[]
  codexAccounts: Account[]
  openCode: { available: boolean }
  onRestore: () => void
}) {
  return (
    <>
      <ShellSection
        key={props.machine}
        machine={props.machine}
        config={props.config}
        platform={props.platform}
        defaultShell={props.defaultShell}
      />
      <AgentsSection machine={props.machine} config={props.config} />
      <GitSection
        key={`git-${props.machine}`}
        machine={props.machine}
        config={props.config}
        claudeAccounts={props.claudeAccounts}
        codexAccounts={props.codexAccounts}
        openCode={props.openCode}
      />
      <Button variant="outline" onClick={props.onRestore}>
        Restore machine defaults
      </Button>
    </>
  )
}

function ShellSection(props: {
  machine: string
  config: Config
  platform: Platform
  defaultShell: string
}) {
  const terminal = props.config.terminal
  const [platform, setPlatform] = useState(props.platform)
  const shellIssue = shellIntegrationIssue(
    terminal.shell[props.platform],
    props.platform,
    props.defaultShell
  )

  function commit(next: TerminalConfig) {
    updateConfig(props.machine, { ...props.config, terminal: next })
  }

  return (
    <Section title="Shell" note="Applies to new terminals">
      <Row label="Platform">
        <Select
          value={platform}
          onValueChange={(value: Platform) => setPlatform(value)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {platforms.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
                {item.value === props.platform && (
                  <span className="text-muted-foreground">(this machine)</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Command">
        <ShellInput
          key={`${props.machine}-${platform}-command`}
          machine={props.machine}
          platform={platform}
          device={props.platform}
          value={terminal.shell[platform]}
          onCommit={(command) =>
            commit({
              ...terminal,
              shell: { ...terminal.shell, [platform]: command },
            })
          }
        />
      </Row>
      <Row
        label={
          <span className="flex items-center gap-1.5">
            Shell integration
            <Tooltip
              label={
                <div>
                  Tells the terminal where prompts and commands start and end.
                  <ul className="mt-1 list-disc pl-4">
                    <li>Click in the command line to move the cursor</li>
                    <li>
                      Ignore clipboard reads once the command that asked has
                      finished
                    </li>
                  </ul>
                </div>
              }
            >
              <span onClick={(event) => event.preventDefault()}>
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  aria-label="About shell integration"
                  className="text-muted-foreground size-3.5"
                />
              </span>
            </Tooltip>
          </span>
        }
      >
        <div className="flex items-center gap-3">
          {shellIssue !== null && (
            <span className="text-muted-foreground max-w-32 text-right text-xs sm:max-w-none">
              {shellIssue}
            </span>
          )}
          <Switch
            checked={shellIssue === null && terminal.behavior.shellIntegration}
            disabled={shellIssue !== null}
            onCheckedChange={(shellIntegration) =>
              commit({
                ...terminal,
                behavior: { ...terminal.behavior, shellIntegration },
              })
            }
          />
        </div>
      </Row>
      <IdentityRow
        identity={terminal.behavior.terminalIdentity}
        onChange={(terminalIdentity) =>
          commit({
            ...terminal,
            behavior: { ...terminal.behavior, terminalIdentity },
          })
        }
      />
    </Section>
  )
}

function IdentityRow(props: {
  identity: TerminalIdentity
  onChange: (identity: TerminalIdentity) => void
}) {
  return (
    <Row label="Report the terminal as">
      <Select value={props.identity} onValueChange={props.onChange}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="offsite">offsite</SelectItem>
          <SelectItem value="ghostty">Ghostty</SelectItem>
          <SelectItem value="iterm2">iTerm2</SelectItem>
        </SelectContent>
      </Select>
    </Row>
  )
}
