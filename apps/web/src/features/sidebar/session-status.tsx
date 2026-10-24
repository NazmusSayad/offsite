import {
  BadgeQuestionMarkIcon,
  CheckmarkCircle03Icon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  ShieldAlertIcon,
  ShieldQuestionMarkIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'

export function SessionStatus(props: {
  activity: SessionActivity | undefined
  backgroundRunning: boolean
  done: boolean
}) {
  return props.activity?.approval === true &&
    props.activity?.question === true ? (
    <span
      title="Waiting for approval and an answer"
      className="text-question flex"
    >
      <HugeiconsIcon
        icon={ShieldQuestionMarkIcon}
        className="size-4 shrink-0"
      />
    </span>
  ) : props.activity?.approval === true ? (
    <span title="Waiting for approval" className="text-question flex">
      <HugeiconsIcon icon={ShieldAlertIcon} className="size-4 shrink-0" />
    </span>
  ) : props.activity?.question === true ? (
    <span title="Waiting for an answer" className="text-question flex">
      <HugeiconsIcon icon={BadgeQuestionMarkIcon} className="size-4 shrink-0" />
    </span>
  ) : props.activity?.running === true ? (
    <span title="Working" className="text-info flex">
      <HugeiconsIcon
        icon={CircleDotDashedIcon}
        className="size-4 shrink-0 animate-spin"
      />
    </span>
  ) : props.backgroundRunning ? (
    props.activity?.backgroundAgent === true ? (
      <span title="Agent running in background" className="text-info flex">
        <HugeiconsIcon
          icon={CircleDashedIcon}
          className="size-4 shrink-0 animate-spin"
        />
      </span>
    ) : (
      <span
        title="Task running in background"
        className="text-muted-foreground flex"
      >
        <HugeiconsIcon
          icon={CircleDashedIcon}
          className="size-4 shrink-0 animate-spin"
        />
      </span>
    )
  ) : props.done ? (
    <span title="Done" className="text-success flex">
      <HugeiconsIcon icon={CheckmarkCircle03Icon} className="size-4 shrink-0" />
    </span>
  ) : null
}
