import { DemoVideo } from './demo-video'
import { Facts } from './facts'
import { Features } from './features'
import { Footer } from './footer'
import { Hero } from './hero'
import { HowItWorks } from './how-it-works'
import { Install } from './install'
import { ThemeLab } from './theme-lab'

export function Home() {
  return (
    <main className="overflow-x-clip px-4 sm:px-6">
      <div className="mx-auto max-w-6xl border-x">
        <Hero />
        <Facts />
        <HowItWorks />
        <Features />
        <section className="corner-marks border-t p-4 sm:p-6">
          <DemoVideo />
        </section>
        <ThemeLab />
        <Install />
        <Footer />
      </div>
    </main>
  )
}
