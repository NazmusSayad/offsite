import {
  CheckmarkCircle03Icon,
  CircleDotDashedIcon,
  CommandLineIcon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ThreadModel } from '@offsite/core/sessions'
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { MachineLogo } from '@/constants/machine-icons'
import { SubagentIcon } from '@/features/transcript/agent-pill'
import { logger } from '@/lib/log'
import { router } from '@/lib/router'
import { closeSession } from '@/lib/sessions'
import { type MachineSession, threadState, useStore } from '@/lib/store'
import { activityPage, onGuard } from '@/lib/url'
import { cn } from '@/lib/utils'
import { ActivityCanvas, reveal } from './activity-canvas'
import {
  type Agent,
  cardId,
  modelLabel,
  runningTasks,
  stageOf,
} from './agent-card'

const log = logger.withTag('activity')

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
  const unseen = useStore((state) => state.unseen)
  const [models, setModels] = useState<Record<string, ThreadModel>>({})
  const [now, setNow] = useState(Date.now)
  const canvas = useRef<ReactZoomPanPinchRef>(null)
  const focused = useRef<string | null>(null)
  const asked = useRef(new Set<string>())
  const online = machines.filter((machine) => machine.status === 'online')
  const finished = sessions.filter(
    (session) =>
      online.some(
        (machine) =>
          machine.id === session.machine &&
          machine.activity[session.id] === undefined
      ) && unseen.includes(machineKey(session.machine, session.id))
  )
  const missing = finished.filter(
    (session) => models[modelKey(session)] === undefined
  )
  const agents = online
    .flatMap((machine) => {
      const accounts = [...machine.claudeAccounts, ...machine.codexAccounts]
      return [
        ...Object.entries(machine.activity).flatMap((entry) => {
          const session = [...sessions, ...inactive].find(
            (item) => item.machine === machine.id && item.id === entry[0]
          )
          return session === undefined
            ? []
            : [
                {
                  session,
                  activity: entry[1],
                  done: threadState(
                    entry[1],
                    session.status !== 'inactive' &&
                      unseen.includes(machineKey(machine.id, entry[0]))
                  ).done,
                  account:
                    accounts.find(
                      (account) => account.id === entry[1].settings.accountId
                    )?.name ?? null,
                  model: modelLabel(
                    entry[1].settings.model,
                    entry[1].settings.effort,
                    entry[1]
                  ),
                },
              ]
        }),
        ...finished
          .filter((session) => session.machine === machine.id)
          .map((session) => {
            const found = models[modelKey(session)]
            return {
              session,
              activity: null,
              done: true,
              account:
                accounts.find((account) => account.id === found?.accountId)
                  ?.name ?? null,
              model: found?.model ?? null,
            }
          }),
      ]
    })
    .sort(
      (first, second) =>
        stageOf(first) - stageOf(second) ||
        second.session.updatedAt - first.session.updatedAt
    )
  const boards = [...new Set(agents.map((agent) => projectKey(agent)))].map(
    (key) => agents.filter((agent) => projectKey(agent) === key)
  )
  const ordered = boards.flat()

  const load = useEffectEvent(() => {
    const wanted = missing.filter(
      (session) => !asked.current.has(modelKey(session))
    )
    for (const machine of new Set(wanted.map((session) => session.machine))) {
      const batch = wanted.filter((session) => session.machine === machine)
      for (const session of batch) {
        asked.current.add(modelKey(session))
      }
      call(machine, 'activity.models', {
        sessionIds: batch.map((session) => session.id),
      }).then(
        (result) =>
          setModels((all) => ({
            ...all,
            ...Object.fromEntries(
              batch.map((session) => [modelKey(session), result[session.id]])
            ),
          })),
        (error: unknown) => {
          for (const session of batch) {
            asked.current.delete(modelKey(session))
          }
          log.error('could not load thread models', error)
        }
      )
    }
  })
  const pending = missing.map((session) => modelKey(session)).join('\n')

  useEffect(() => load(), [pending])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  function jump(targets: Agent[]) {
    const index = targets.findIndex(
      (agent) => cardId(agent.session) === focused.current
    )
    const next = targets[(index + 1) % targets.length]
    const element = document.getElementById(cardId(next.session))
    if (canvas.current === null || element === null) {
      return
    }
    focused.current = cardId(next.session)
    reveal(canvas.current, element, props.mobile)
  }

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
          'flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b text-xs tabular-nums',
          props.mobile ? 'px-2' : 'px-4'
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
          count={agents.filter((agent) => stageOf(agent) === 0).length}
          targets={ordered.filter((agent) => stageOf(agent) === 0)}
          onJump={jump}
        />
        <Stat
          title="Working"
          icon={
            <HugeiconsIcon
              icon={CircleDotDashedIcon}
              className="text-info size-3.5"
            />
          }
          count={agents.filter((agent) => stageOf(agent) === 1).length}
          targets={ordered.filter((agent) => stageOf(agent) === 1)}
          onJump={jump}
        />
        <Stat
          title="Subagents"
          icon={<SubagentIcon className="text-muted-foreground size-3" />}
          count={agents.reduce(
            (sum, agent) => sum + (agent.activity?.backgroundAgents ?? 0),
            0
          )}
          targets={ordered.filter(
            (agent) => (agent.activity?.backgroundAgents ?? 0) > 0
          )}
          onJump={jump}
        />
        <Stat
          title="Background tasks"
          icon={
            <HugeiconsIcon
              icon={CommandLineIcon}
              className="text-muted-foreground size-3.5"
            />
          }
          count={agents.reduce((sum, agent) => sum + backgroundTasks(agent), 0)}
          targets={ordered.filter((agent) => backgroundTasks(agent) > 0)}
          onJump={jump}
        />
        <Stat
          title="Done"
          icon={
            <HugeiconsIcon
              icon={CheckmarkCircle03Icon}
              className="text-success size-3.5"
            />
          }
          count={agents.filter((agent) => stageOf(agent) === 3).length}
          targets={ordered.filter((agent) => stageOf(agent) === 3)}
          onJump={jump}
        />
      </header>
      {agents.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 pt-[20vh]">
          <p className="text-muted-foreground text-sm">No agents running</p>
          {machines
            .filter((machine) => machine.status !== 'online')
            .map((machine) => (
              <p
                key={machine.id}
                className="text-muted-foreground flex items-center gap-2 text-xs"
              >
                <MachineLogo icon={machine.icon} className="size-4 shrink-0" />
                <span className="text-foreground">{machine.name}</span>
                {machine.status === 'connecting' && 'Connecting…'}
                {machine.status === 'offline' && 'Offline'}
                {machine.status === 'unpaired' && 'Needs pairing'}
              </p>
            ))}
        </div>
      ) : (
        <ActivityCanvas
          canvas={canvas}
          machines={machines.filter(
            (machine) =>
              machine.status !== 'online' ||
              agents.some((agent) => agent.session.machine === machine.id)
          )}
          boards={boards}
          now={now}
          mobile={props.mobile}
        />
      )}
    </main>
  )
}

function Stat(props: {
  title: string
  icon: ReactNode
  count: number
  targets: Agent[]
  onJump: (targets: Agent[]) => void
}) {
  if (props.count === 0) {
    return null
  }
  return (
    <button
      className="text-foreground hover:bg-foreground/5 flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2"
      title={props.title}
      aria-label={`${props.title}: ${props.count}`}
      onClick={() => props.onJump(props.targets)}
    >
      {props.icon}
      {props.count}
    </button>
  )
}

function backgroundTasks(agent: Agent) {
  return agent.activity === null
    ? 0
    : runningTasks(agent.activity) - agent.activity.backgroundAgents
}

function modelKey(session: MachineSession) {
  return `${machineKey(session.machine, session.id)} ${session.updatedAt}`
}

function projectKey(agent: Agent) {
  return `${agent.session.machine}\n${agent.session.projectId}`
}
