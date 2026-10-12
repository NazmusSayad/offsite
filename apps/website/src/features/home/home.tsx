import { Features } from './features'
import { Footer } from './footer'
import { Hero } from './hero'
import { HowItWorks } from './how-it-works'
import { Install } from './install'
import { ThemeLab } from './theme-lab'

export function Home() {
  return (
    <main className="overflow-x-clip">
      <Hero />
      <HowItWorks />
      <Features />
      <ThemeLab />
      <Install />
      <Footer />
    </main>
  )
}
