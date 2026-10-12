import { DemoFilm } from './demo-film'
import { FeatureRows } from './feature-rows'
import { Footer } from './footer'
import { Hero } from './hero'
import { Install } from './install'
import { ThemeLab } from './theme-lab'

export function Home() {
  return (
    <main className="overflow-x-clip">
      <Hero />
      <DemoFilm />
      <FeatureRows />
      <ThemeLab />
      <Install />
      <Footer />
    </main>
  )
}
