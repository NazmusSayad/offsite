export function commandSummary(command: string) {
  const wrapped = /^\/(?:[^/\s]+\/)*bash -lc (?:'([^']*)'|"([^"]*)")$/s.exec(
    command
  )
  return wrapped?.[1] ?? wrapped?.[2] ?? command
}
