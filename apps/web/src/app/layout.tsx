import { RootProvider } from 'fumadocs-ui/provider/next'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './global.css'

export const metadata: Metadata = {
  title: {
    default: 'OffSite: Claude Code, Codex and OpenCode in your browser',
    template: '%s · OffSite',
  },
  description:
    'Claude Code, Codex and OpenCode in your browser, on the same sessions as their CLIs. Start a task in the terminal, check on it from your phone, finish it at your desk.',
  icons: { icon: '/icon.svg' },
  openGraph: {
    type: 'website',
    title: 'OffSite: Claude Code, Codex and OpenCode in your browser',
    description:
      'Runs on your machine, opens the same sessions as the CLIs, and reaches your phone through one pairing link.',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c0f' },
  ],
}

export default function Layout(props: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider>{props.children}</RootProvider>
      </body>
    </html>
  )
}
