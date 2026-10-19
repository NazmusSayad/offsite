import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Wrapper(props: {
  width: 'chat' | 'composer'
  className: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        props.width === 'chat' &&
          'max-w-[min(var(--chat-content-max-width),calc(100%-2*var(--wrapper-gutter)))]',
        props.width === 'composer' &&
          'max-w-[min(calc(var(--chat-content-max-width)+1rem),calc(100%-2*var(--wrapper-gutter)))]',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}
