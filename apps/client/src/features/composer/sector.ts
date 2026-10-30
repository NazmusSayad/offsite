export function sector(
  radius: number,
  inner: number,
  outer: number,
  start: number,
  end: number
) {
  const outerStart = point(radius, outer, start + Math.asin(0.5 / outer))
  const outerEnd = point(radius, outer, end - Math.asin(0.5 / outer))
  const innerEnd = point(radius, inner, end - Math.asin(0.5 / inner))
  const innerStart = point(radius, inner, start + Math.asin(0.5 / inner))
  const bounds = [
    outerStart,
    outerEnd,
    innerEnd,
    innerStart,
    ...(start < Math.PI / 2 && end > Math.PI / 2
      ? [point(radius, outer, Math.PI / 2)]
      : []),
  ]
  const left = Math.min(...bounds.map((item) => item.x))
  const top = Math.min(...bounds.map((item) => item.y))
  const middle = point(radius, (inner + outer) / 2, (start + end) / 2)
  return {
    style: {
      left,
      top,
      width: Math.max(...bounds.map((item) => item.x)) - left,
      height: Math.max(...bounds.map((item) => item.y)) - top,
      clipPath: `path('M${outerStart.x - left} ${outerStart.y - top} A${outer} ${outer} 0 0 0 ${outerEnd.x - left} ${outerEnd.y - top} L${innerEnd.x - left} ${innerEnd.y - top} A${inner} ${inner} 0 0 1 ${innerStart.x - left} ${innerStart.y - top}Z')`,
    },
    center: { left: middle.x - left, top: middle.y - top },
  }
}

function point(radius: number, distance: number, angle: number) {
  return {
    x: radius + distance * Math.cos(angle),
    y: radius - distance * Math.sin(angle),
  }
}
