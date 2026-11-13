import {
  CircleDotDashedIcon,
  CommandLineIcon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { ProviderIcon } from '@/components/icons'
import { MachineLogo } from '@/constants/machine-icons'
import { SubagentIcon } from '@/features/transcript/agent-pill'
import { UsageMeter } from '@/features/usage/usage-meters'
import { providerNames } from '@/lib/format'
import { router } from '@/lib/router'
import { closeSession } from '@/lib/sessions'
import { type Machine, useStore } from '@/lib/store'
import { activityPage, onGuard } from '@/lib/url'
import { hasUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'
import { type Agent, AgentTile, runningTasks, stageOf } from './agent-card'

export function openActivityPage() {
  if (activityPage()) {
    return
  }
  void router.navigate({
    to: '/activity',
    search: {},
    replace: onGuard(),
    resetScroll: false,
  })
  closeSession()
}

export function ActivityPage(props: { leading: ReactNode; mobile: boolean }) {
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const inactive = useStore((state) => state.inactive)
  const [now, setNow] = useState(Date.now)
  const agents = machines
    .filter((machine) => machine.status === 'online')
    .flatMap((machine) =>
      Object.entries(machine.activity).flatMap((entry) => {
        const session = [...sessions, ...inactive].find(
          (item) => item.machine === machine.id && item.id === entry[0]
        )
        return session === undefined ? [] : [{ session, activity: entry[1] }]
      })
    )
    .sort(
      (first, second) =>
        stageOf(first.activity) - stageOf(second.activity) ||
        second.session.updatedAt - first.session.updatedAt
    )

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <main
      className={cn(
        'bg-background flex min-w-0 flex-1 flex-col overflow-hidden',
        props.mobile &&
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <header
        className={cn(
          'flex h-(--workspace-topbar-height) shrink-0 items-center gap-4 text-xs tabular-nums',
          props.mobile ? 'px-2' : 'px-5'
        )}
      >
        {props.leading}
        <Stat
          title="Need you"
          icon={
            <HugeiconsIcon
              icon={ShieldAlertIcon}
              className="text-question size-3.5"
            />
          }
          value={agents.filter((agent) => stageOf(agent.activity) === 0).length}
        />
        <Stat
          title="Working"
          icon={
            <HugeiconsIcon
              icon={CircleDotDashedIcon}
              className="text-info size-3.5"
            />
          }
          value={agents.filter((agent) => stageOf(agent.activity) === 1).length}
        />
        <Stat
          title="Subagents"
          icon={<SubagentIcon className="text-muted-foreground size-3" />}
          value={agents.reduce(
            (sum, agent) => sum + agent.activity.backgroundAgents,
            0
          )}
        />
        <Stat
          title="Background tasks"
          icon={
            <HugeiconsIcon
              icon={CommandLineIcon}
              className="text-muted-foreground size-3.5"
            />
          }
          value={agents.reduce(
            (sum, agent) =>
              sum +
              runningTasks(agent.activity) -
              agent.activity.backgroundAgents,
            0
          )}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 pt-[20vh]">
            <p className="text-muted-foreground text-sm">No agents running</p>
            {machines
              .filter((machine) => machine.status !== 'online')
              .map((machine) => (
                <MachineTree
                  key={machine.id}
                  machine={machine}
                  agents={[]}
                  now={now}
                />
              ))}
          </div>
        ) : (
          <div className="grid items-start gap-x-10 gap-y-8 px-5 pt-2 pb-10 md:grid-cols-[repeat(auto-fill,minmax(24rem,1fr))]">
            {machines
              .filter(
                (machine) =>
                  machine.status !== 'online' ||
                  agents.some((agent) => agent.session.machine === machine.id)
              )
              .map((machine) => (
                <MachineTree
                  key={machine.id}
                  machine={machine}
                  agents={agents.filter(
                    (agent) => agent.session.machine === machine.id
                  )}
                  now={now}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  )
}

function Stat(props: { title: string; icon: ReactNode; value: number }) {
  if (props.value === 0) {
    return null
  }
  return (
    <span
      className="text-foreground flex items-center gap-1.5"
      title={props.title}
    >
      {props.icon}
      {props.value}
    </span>
  )
}

function MachineTree(props: {
  machine: Machine
  agents: Agent[]
  now: number
}) {
  const groups = [
    ...new Set(props.agents.map((agent) => accountKey(agent))),
  ].map((key) => props.agents.filter((agent) => accountKey(agent) === key))

  return (
    <section className="flex min-w-0 flex-col">
      <h2 className="flex h-8 min-w-0 items-center gap-2">
        <MachineLogo icon={props.machine.icon} className="size-4 shrink-0" />
        <span className="text-foreground truncate font-medium">
          {props.machine.name}
        </span>
        {props.machine.status !== 'online' && (
          <span className="text-warning-foreground ml-auto shrink-0 text-xs">
            {props.machine.status === 'connecting' && 'Connecting…'}
            {props.machine.status === 'offline' && 'Offline'}
            {props.machine.status === 'unpaired' && 'Needs pairing'}
          </span>
        )}
      </h2>
      <ul className="ml-[7px]">
        {groups.map((agents) => (
          <Twig key={accountKey(agents[0])} anchor="row">
            <AccountRow machine={props.machine} agents={agents} />
            <ul className="ml-[7px]">
              {agents.map((agent) => (
                <Twig key={agent.session.id} anchor="tile">
                  <AgentTile agent={agent} now={props.now} />
                </Twig>
              ))}
            </ul>
          </Twig>
        ))}
      </ul>
    </section>
  )
}

function AccountRow(props: { machine: Machine; agents: Agent[] }) {
  const settings = props.agents[0].activity.settings
  const account = [
    ...props.machine.claudeAccounts,
    ...props.machine.codexAccounts,
  ].find((item) => item.id === settings.accountId)

  return (
    <div className="flex h-8 min-w-0 items-center gap-2">
      <ProviderIcon provider={settings.provider} className="size-4 shrink-0" />
      <span className="text-foreground truncate">
        {account?.name ?? providerNames[settings.provider]}
      </span>
      {account !== undefined && hasUsage(account) && (
        <UsageMeter
          machine={props.machine.id}
          account={account}
          icon={false}
          className="ml-auto"
        />
      )}
    </div>
  )
}

function Twig(props: { anchor: 'row' | 'tile'; children: ReactNode }) {
  return (
    <li
      className={cn(
        'before:border-foreground/15 after:border-foreground/15 relative pl-5 before:absolute before:top-0 before:left-0 before:w-3.5 before:rounded-bl-md before:border-b before:border-l after:absolute after:top-0 after:bottom-0 after:left-0 after:border-l last:after:hidden',
        props.anchor === 'row' && 'pt-2 before:h-6',
        props.anchor === 'tile' && 'pt-1.5 before:h-[23px]'
      )}
    >
      {props.children}
    </li>
  )
}

function accountKey(agent: Agent) {
  return `${agent.activity.settings.provider}\n${agent.activity.settings.accountId}`
}
