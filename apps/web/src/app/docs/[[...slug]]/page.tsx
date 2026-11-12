import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page'
import defaultMdxComponents, { createRelativeLink } from 'fumadocs-ui/mdx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { source } from '@/lib/source'

type Props = { params: Promise<{ slug?: string[] }> }

export default async function Page(props: Props) {
  const page = source.getPage((await props.params).slug)
  if (page === undefined) {
    notFound()
  }
  const Body = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <Body
          components={{
            ...defaultMdxComponents,
            a: createRelativeLink(source, page),
          }}
        />
      </DocsBody>
    </DocsPage>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = source.getPage((await props.params).slug)
  if (page === undefined) {
    notFound()
  }
  return {
    title: page.data.title,
    description: page.data.description,
  }
}
