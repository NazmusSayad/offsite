const facts = [
  {
    title: 'On your machine',
    description: 'Shells run on your computer, as you.',
  },
  {
    title: 'No account',
    description: 'Nothing to sign up for. It opens on localhost.',
  },
  {
    title: 'macOS, Linux, Windows',
    description: 'Prebuilt binaries, nothing to compile.',
  },
  {
    title: 'MIT licensed',
    description: 'Open source on GitHub.',
  },
]

export function Facts() {
  return (
    <ul className="corner-marks bg-border grid gap-px border-t sm:grid-cols-2 lg:grid-cols-4">
      {facts.map((fact) => (
        <li key={fact.title} className="bg-background px-6 py-7">
          <p className="font-mono text-sm">{fact.title}</p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {fact.description}
          </p>
        </li>
      ))}
    </ul>
  )
}
