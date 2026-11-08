import type { SearchRange } from '@offsite/core/search-match'
import { Fragment } from 'react'

export function Highlighted(props: { text: string; ranges: SearchRange[] }) {
  return (
    <>
      {props.ranges.map((range, index) => (
        <Fragment key={range.start}>
          {props.text.slice(props.ranges[index - 1]?.end ?? 0, range.start)}
          <mark className="text-foreground bg-transparent font-medium">
            {props.text.slice(range.start, range.end)}
          </mark>
        </Fragment>
      ))}
      {props.text.slice(props.ranges.at(-1)?.end ?? 0)}
    </>
  )
}
