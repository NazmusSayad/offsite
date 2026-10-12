import '@/styles/index.css'

import { Metadata } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'sshtty: a terminal in your browser that keeps your shells running',
  description:
    'sshtty puts a terminal in your browser, with groups and tabs. Close the browser, come back later, and every shell is still running.',
  openGraph: {
    title: 'sshtty',
    description: 'A terminal in your browser that keeps your shells running.',
    images: ['/tour-poster.jpg'],
  },
}

export default function Layout(props: PropsWithChildren) {
  return (
    <html
      lang="en"
      className={cn('dark', geist.variable, jetbrainsMono.variable)}
    >
      <body>{props.children}</body>
    </html>
  )
}
