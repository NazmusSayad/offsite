import type { SlashCommand } from '@offsite/core/providers'

export const skillPill = 'bg-info/15 text-info rounded-md px-1.5 py-0.5'

export function skillRanges(text: string, commands: SlashCommand[]) {
  const ranges: { start: number; end: number }[] = []
  const inline = commands
    .filter((command) => command.inline)
    .map((command) => command.name)
  if (text.startsWith('/')) {
    for (const match of text.matchAll(/\/(\S+)\s*/gy)) {
      const name = match[1]
      const known =
        ranges.length === 0
          ? commands.some((command) => command.name === name)
          : ranges.length < 6 &&
            inline.includes(text.slice(1, ranges[0].end)) &&
            inline.includes(name)
      if (!known) {
        break
      }
      ranges.push({ start: match.index, end: match.index + 1 + name.length })
    }
    return ranges
  }
  for (const match of text.matchAll(
    /(^|[\s。、？！])(\/[a-zA-Z][a-zA-Z0-9.:\-_]*)/g
  )) {
    const start = match.index + match[1].length
    const end = start + match[2].replace(/\.+$/, '').length
    if (
      (start !== 0 && !/\s/.test(text[start - 1])) ||
      (end !== text.length && !/\s/.test(text[end]))
    ) {
      continue
    }
    if (inline.includes(text.slice(start + 1, end))) {
      ranges.push({ start, end })
    }
  }
  return ranges
}
