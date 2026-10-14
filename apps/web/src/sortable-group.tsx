import { attachClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge'
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge'
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import {
  draggable,
  dropTargetForElements,
  type ElementEventBasePayload,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { send } from '@/session'
import { focusTerminal } from '@/shortcuts'

type Data = { data: Record<string | symbol, unknown> }

export function SortableGroup(props: {
  id: number
  index: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const { id, index } = props

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    return combine(
      draggable({
        element,
        getInitialData: () => ({ id, index }),
        onDragStart: () => setDragging(true),
        onDrop: () => {
          setDragging(false)
          focusTerminal()
        },
      }),
      dropTargetForElements({
        element,
        getData: ({ input }) =>
          attachClosestEdge(
            { index },
            { element, input, allowedEdges: ['top', 'bottom'] }
          ),
        onDrop: ({ self, source }) => {
          const destination = dropIndex(source, self)
          if (destination === source.data.index) return
          send({
            type: 'moveGroup',
            id: source.data.id as number,
            index: destination,
          })
        },
      })
    )
  }, [id, index])

  return (
    <div
      ref={ref}
      draggable
      className={cn(
        'relative -my-px flex flex-none flex-col py-px md:-my-0.5 md:py-0.5',
        dragging && 'opacity-40'
      )}
    >
      {props.children}
    </div>
  )
}

export function DropIndicator() {
  const [top, setTop] = useState<number | null>(null)

  useEffect(() => {
    function update({ location, source }: ElementEventBasePayload) {
      const target = location.current.dropTargets[0]
      if (
        target === undefined ||
        dropIndex(source, target) === source.data.index
      ) {
        setTop(null)
        return
      }
      const element = target.element as HTMLElement
      const edge = extractClosestEdge(target.data)
      if (edge === 'top') setTop(element.offsetTop - 1)
      if (edge === 'bottom')
        setTop(element.offsetTop + element.offsetHeight - 1)
    }

    return monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDropTargetChange: update,
      onDrop: () => setTop(null),
    })
  }, [])

  if (top === null) return null
  return (
    <div
      className="bg-primary pointer-events-none absolute inset-x-3 top-0 h-0.5 rounded-full transition-transform duration-150 ease-out motion-reduce:transition-none md:inset-x-2"
      style={{ transform: `translateY(${top}px)` }}
    />
  )
}

function dropIndex(source: Data, target: Data) {
  return getReorderDestinationIndex({
    startIndex: source.data.index as number,
    closestEdgeOfTarget: extractClosestEdge(target.data),
    indexOfTarget: target.data.index as number,
    axis: 'vertical',
  })
}
