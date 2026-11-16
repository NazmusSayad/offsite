import {
  CenterFocusIcon,
  MinusSignIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'
import { useProjectName } from '@/api/projects'
import { ProjectIcon, ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { MachineLogo } from '@/constants/machine-icons'
import { UsageMeter } from '@/features/usage/usage-meters'
import type { Machine } from '@/lib/store'
import { hasUsage } from '@/lib/usage'
import { cn } from '@/lib/utils'
import { type Agent, AgentCard } from './agent-card'

const boardGap = 20

export function ActivityCanvas(props: {
  canvas: RefObject<ReactZoomPanPinchRef | null>
  machines: Machine[]
  boards: Agent[][]
  now: number
  mobile: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const press = useRef({ x: 0, y: 0 })
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [sheet, setSheet] = useState({ width: 0, height: 0 })
  const groups = props.machines.map((machine) => ({
    machine,
    boards: props.boards.filter(
      (agents) => agents[0].session.machine === machine.id
    ),
  }))
  const padding = props.mobile ? 16 : 24
  const boardWidth = props.mobile ? width - padding * 2 : 352
  const columns = props.mobile
    ? 1
    : Math.max(
        1,
        Math.min(
          Math.max(...groups.map((group) => group.boards.length)),
          Math.floor((width - padding * 2 + boardGap) / (boardWidth + boardGap))
        )
      )
  const fit = Math.min(1, width / sheet.width, height / sheet.height)

  useEffect(() => {
    const node = frame.current
    if (node === null) {
      return
    }
    const observer = new ResizeObserver(() => {
      setWidth(node.clientWidth)
      setHeight(node.clientHeight)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const measure = useCallback((node: HTMLDivElement | null) => {
    if (node === null) {
      return
    }
    const observer = new ResizeObserver(() =>
      setSheet({ width: node.offsetWidth, height: node.offsetHeight })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frame} className="relative min-h-0 flex-1 overflow-hidden">
      {width > 0 && (
        <TransformWrapper
          ref={props.canvas}
          minScale={fit}
          maxScale={2}
          centerZoomedOut
          disablePadding
          zoomAnimation={{ disabled: true }}
          autoAlignment={{ sizeX: 0, sizeY: 0 }}
          wheel={{
            activationKeys: (keys) =>
              keys.includes('Meta') || keys.includes('Control'),
          }}
          trackPadPanning={{ disabled: false }}
          doubleClick={{ mode: 'zoomIn', step: 0.7, excluded: ['button'] }}
        >
          {(controls) => (
            <>
              <TransformComponent
                wrapperClass="size-full! touch-none"
                contentClass="min-w-full! min-h-full!"
                contentProps={{
                  onPointerDownCapture: (event) => {
                    press.current = { x: event.clientX, y: event.clientY }
                  },
                  onClickCapture: (event) => {
                    if (
                      Math.hypot(
                        event.clientX - press.current.x,
                        event.clientY - press.current.y
                      ) > 6
                    ) {
                      event.preventDefault()
                      event.stopPropagation()
                    }
                  },
                }}
              >
                <div
                  ref={measure}
                  className="flex flex-col gap-8"
                  style={{
                    padding,
                    paddingBottom: padding + 56,
                    width:
                      columns * boardWidth +
                      (columns - 1) * boardGap +
                      padding * 2,
                  }}
                >
                  {groups.map((group) => (
                    <div key={group.machine.id} className="flex flex-col gap-3">
                      <MachineLabel
                        machine={group.machine}
                        agents={group.boards.flat()}
                      />
                      {group.boards.length > 0 && (
                        <div
                          style={{ columnCount: columns, columnGap: boardGap }}
                        >
                          {group.boards.map((agents) => (
                            <ProjectBoard
                              key={agents[0].session.projectId}
                              agents={agents}
                              width={boardWidth}
                              now={props.now}
                              onReveal={(element) => {
                                if (props.canvas.current !== null) {
                                  reveal(
                                    props.canvas.current,
                                    element,
                                    props.mobile
                                  )
                                }
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TransformComponent>
              <div
                className={cn(
                  'bg-background/85 absolute bottom-4 flex items-center gap-0.5 rounded-full border p-1 shadow-sm backdrop-blur-sm',
                  props.mobile ? 'left-1/2 -translate-x-1/2' : 'right-5'
                )}
              >
                <Tooltip label="Zoom out">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom out"
                    className="rounded-full"
                    onClick={() => void controls.zoomOut()}
                  >
                    <HugeiconsIcon icon={MinusSignIcon} className="size-4" />
                  </Button>
                </Tooltip>
                <Tooltip label="Zoom in">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Zoom in"
                    className="rounded-full"
                    onClick={() => void controls.zoomIn()}
                  >
                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
                  </Button>
                </Tooltip>
                <Tooltip label="Show everything">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Show everything"
                    className="rounded-full"
                    onClick={() =>
                      void controls.fitToView({
                        maxScale: 1,
                        animationTime: 300,
                      })
                    }
                  >
                    <HugeiconsIcon icon={CenterFocusIcon} className="size-4" />
                  </Button>
                </Tooltip>
              </div>
            </>
          )}
        </TransformWrapper>
      )}
    </div>
  )
}

function MachineLabel(props: { machine: Machine; agents: Agent[] }) {
  const accounts = [
    ...props.machine.claudeAccounts,
    ...props.machine.codexAccounts,
  ].filter((account) =>
    props.agents.some(
      (agent) => agent.activity?.settings.accountId === account.id
    )
  )

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
      <span className="flex min-w-0 items-center gap-2">
        <MachineLogo icon={props.machine.icon} className="size-5 shrink-0" />
        <span className="text-foreground truncate text-lg font-semibold">
          {props.machine.name}
        </span>
      </span>
      {props.machine.status !== 'online' && (
        <span className="text-warning-foreground shrink-0">
          {props.machine.status === 'connecting' && 'Connecting…'}
          {props.machine.status === 'offline' && 'Offline'}
          {props.machine.status === 'unpaired' && 'Needs pairing'}
        </span>
      )}
      {accounts.map((account) => (
        <span
          key={account.id}
          className="text-muted-foreground flex min-w-0 items-center gap-1.5"
        >
          <ProviderIcon provider={account.provider} className="size-3.5" />
          <span className="max-w-32 truncate">{account.name}</span>
          {hasUsage(account) && (
            <UsageMeter
              machine={props.machine.id}
              account={account}
              icon={false}
            />
          )}
        </span>
      ))}
    </div>
  )
}

function ProjectBoard(props: {
  agents: Agent[]
  width: number
  now: number
  onReveal: (element: HTMLElement) => void
}) {
  const session = props.agents[0].session
  const name = useProjectName(session.machine, session.projectId)

  return (
    <section
      className={cn(
        'mb-5 flex break-inside-avoid flex-col gap-2 rounded-xl p-2',
        props.agents.some((agent) => agent.activity?.waiting === true)
          ? 'bg-question/6'
          : 'bg-foreground/3'
      )}
      style={{ width: props.width }}
    >
      <button
        className="flex min-w-0 cursor-pointer items-center gap-3 px-1.5 pt-1.5 pb-1 text-left"
        onClick={(event) =>
          props.onReveal(
            event.currentTarget.parentElement ?? event.currentTarget
          )
        }
      >
        <ProjectIcon
          machine={session.machine}
          projectId={session.projectId}
          className="size-8 text-sm"
        />
        <span className="text-foreground min-w-0 flex-1 truncate text-base font-semibold">
          {name === '' ? 'Unknown project' : name}
        </span>
        <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
          {props.agents.length}
        </span>
      </button>
      {props.agents.map((agent) => (
        <AgentCard key={agent.session.id} agent={agent} now={props.now} />
      ))}
    </section>
  )
}

export function reveal(
  canvas: ReactZoomPanPinchRef,
  element: HTMLElement,
  mobile: boolean
) {
  const wrapper = canvas.instance.wrapperComponent
  const content = canvas.instance.contentComponent
  if (wrapper === null || content === null) {
    return
  }
  const current = canvas.instance.state.scale
  const box = element.getBoundingClientRect()
  const board = (element.closest('section') ?? element).getBoundingClientRect()
  const origin = content.getBoundingClientRect()
  const width = board.width / current
  const scale = mobile
    ? Math.min(1.2, (wrapper.clientWidth - 24) / width)
    : Math.max(1, current)
  const top =
    ((box.bottom - board.top) / current) * scale <= wrapper.clientHeight - 96
      ? board.top
      : box.top
  void canvas.setTransform(
    (wrapper.clientWidth - width * scale) / 2 -
      ((board.left - origin.left) / current) * scale,
    24 - ((top - origin.top) / current) * scale,
    scale,
    300
  )
}
