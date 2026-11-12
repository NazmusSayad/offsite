import {
  Closing,
  Principles,
  Questions,
  SiteFooter,
} from '@/components/closing'
import { Features, Steps } from '@/components/features'
import { Hero, SiteHeader } from '@/components/hero'
import { Mobile } from '@/components/mobile'
import { Reveal } from '@/components/reveal'

export default function Home() {
  return (
    <div className="bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Steps />
        <Features />
        <Mobile />
        <Principles />
        <Questions />
        <Closing />
      </main>
      <SiteFooter />
      <Reveal />
    </div>
  )
}
