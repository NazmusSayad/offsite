import { DemoVideo } from './demo-video'
import { Features } from './features'
import { Footer } from './footer'
import { Hero } from './hero'
import { Install } from './install'
import { ThemeLab } from './theme-lab'

export function Home() {
  return (
    <main className="overflow-x-clip">
      <Hero />
      <Features />
      <ThemeLab />
      <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <DemoVideo />
      </section>
      <Install />
      <Footer />
    </main>
  )
}
