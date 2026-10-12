import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'

export function Footer() {
  return (
    <footer className="text-muted-foreground flex flex-col items-center gap-6 px-6 py-16 text-center text-sm">
      <Logo className="text-primary size-8" />
      <p>sshtty is in its early stages and actively maintained.</p>
      <nav className="flex gap-6">
        <a href={githubUrl} className="hover:text-foreground">
          GitHub
        </a>
        <a href={npmUrl} className="hover:text-foreground">
          npm
        </a>
        <a
          href={`${githubUrl}/blob/main/LICENSE`}
          className="hover:text-foreground"
        >
          MIT License
        </a>
      </nav>
    </footer>
  )
}
