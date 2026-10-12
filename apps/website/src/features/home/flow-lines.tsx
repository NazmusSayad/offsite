import { cn } from '@/lib/utils'

const paths = Array.from({ length: 14 }, (_, index) => {
  const offset = index - 6.5
  const edge = 300 + offset * 40
  const center = 300 + offset * 6
  return `M -40 ${edge} C 360 ${edge}, 480 ${center}, 720 ${center} S 1080 ${edge}, 1480 ${edge}`
})

export function FlowLines(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 600"
      preserveAspectRatio="none"
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-1/2 -z-10 w-screen -translate-x-1/2 mask-[linear-gradient(90deg,transparent,black_25%,black_75%,transparent)]',
        props.className
      )}
    >
      {paths.map((path) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke="var(--c4)"
          strokeOpacity={0.16}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {paths
        .filter((_, index) => index % 3 === 1)
        .map((path, index) => (
          <path
            key={path}
            d={path}
            fill="none"
            stroke="var(--c4)"
            strokeWidth={1.5}
            strokeLinecap="round"
            pathLength={1000}
            strokeDasharray="70 930"
            vectorEffect="non-scaling-stroke"
            className="animate-travel motion-reduce:hidden"
            style={{
              animationDuration: `${6 + index * 1.7}s`,
              animationDelay: `${index * -2.3}s`,
              animationDirection: index % 2 === 0 ? 'normal' : 'reverse',
            }}
          />
        ))}
    </svg>
  )
}
