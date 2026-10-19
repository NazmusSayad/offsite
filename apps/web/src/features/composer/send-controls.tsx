import type { PromptDelivery } from '@offsite/core/config'
import { mod } from '@/lib/utils'

export function SendControls(props: {
  running: boolean
  empty: boolean
  delivery: PromptDelivery | null
  onSubmit: (swap: boolean) => void
  onStop: () => void
}) {
  return (
    <>
      {props.running && props.empty && (
        <button
          className="bg-destructive/90 shadow-destructive/24 hover:bg-destructive flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white shadow-xs transition-colors"
          title="Stop (Esc)"
          aria-label="Stop generation"
          onClick={props.onStop}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="8" height="8" rx="1.5" />
          </svg>
        </button>
      )}
      {!(props.running && props.empty) && (
        <button
          className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover relative flex size-9 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 hover:scale-105 enabled:cursor-pointer disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none"
          title={
            props.running && props.delivery === 'steer'
              ? `Send now (Enter) · Queue (${mod}+Enter)`
              : props.running
                ? `Queue (Enter) · Send now (${mod}+Enter)`
                : 'Send (Enter)'
          }
          aria-label="Send message"
          disabled={props.empty}
          onClick={(event) => props.onSubmit(event.metaKey || event.ctrlKey)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  )
}
