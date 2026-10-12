import type { SimpleIcon } from 'simple-icons'

export function BrandIcon(props: { icon: SimpleIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={props.className}
      fill="currentColor"
    >
      <path d={props.icon.path} />
    </svg>
  )
}
