import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { baseOptions } from '@/lib/layout'
import { source } from '@/lib/source'

export default function Layout(props: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions}>
      {props.children}
    </DocsLayout>
  )
}
