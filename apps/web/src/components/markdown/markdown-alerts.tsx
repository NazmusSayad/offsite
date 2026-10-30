import {
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type MarkdownNode = {
  type?: string
  value?: unknown
  data?: { hProperties?: Record<string, unknown> }
  children?: MarkdownNode[]
}

const alerts = {
  note: {
    label: 'Note',
    icon: InfoIcon,
    border: 'border-blue-500/70',
    title: 'text-blue-600 dark:text-blue-400',
  },
  tip: {
    label: 'Tip',
    icon: LightbulbIcon,
    border: 'border-emerald-500/70',
    title: 'text-emerald-600 dark:text-emerald-400',
  },
  important: {
    label: 'Important',
    icon: MessageSquareWarningIcon,
    border: 'border-purple-500/70',
    title: 'text-purple-600 dark:text-purple-400',
  },
  warning: {
    label: 'Warning',
    icon: TriangleAlertIcon,
    border: 'border-amber-500/70',
    title: 'text-amber-600 dark:text-amber-500',
  },
  caution: {
    label: 'Caution',
    icon: OctagonAlertIcon,
    border: 'border-red-500/70',
    title: 'text-red-600 dark:text-red-400',
  },
}

export function remarkGithubAlerts() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      node.children?.forEach(visit)
      readAlert(node)
    }
    visit(tree)
  }
}

function readAlert(node: MarkdownNode) {
  if (node.type !== 'blockquote') {
    return
  }
  const paragraph = node.children?.[0]
  const text = paragraph?.children?.[0]
  if (
    paragraph?.type !== 'paragraph' ||
    text?.type !== 'text' ||
    typeof text.value !== 'string'
  ) {
    return
  }
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/i.exec(
    text.value
  )
  if (match === null) {
    return
  }
  const remainder = text.value.slice(match[0].length)
  if (remainder.length > 0) {
    text.value = remainder
  } else if (match[0].endsWith('\n') || paragraph.children?.length === 1) {
    paragraph.children?.shift()
    if (paragraph.children?.length === 0) {
      node.children?.shift()
    }
  } else {
    return
  }
  node.data = {
    ...node.data,
    hProperties: {
      ...node.data?.hProperties,
      dataAlert: match[1].toLowerCase(),
    },
  }
}

export function MarkdownBlockquote(props: {
  kind: unknown
  children: ReactNode
}) {
  const alert =
    props.kind === 'note' ||
    props.kind === 'tip' ||
    props.kind === 'important' ||
    props.kind === 'warning' ||
    props.kind === 'caution'
      ? alerts[props.kind]
      : null
  if (alert === null) {
    return <blockquote>{props.children}</blockquote>
  }
  return (
    <div role="note" className={cn('my-1 border-l-2 pl-3', alert.border)}>
      <p className={cn('flex items-center gap-1.5 font-medium', alert.title)}>
        <HugeiconsIcon
          icon={alert.icon}
          aria-hidden
          className="size-3.5 shrink-0"
        />
        {alert.label}
      </p>
      {props.children}
    </div>
  )
}
