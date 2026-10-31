export type SearchRange = { start: number; end: number }

export type FieldsMatch = {
  quality: number
  strong: boolean
  ranges: SearchRange[]
}

type Field = { value: string; weight: number; midWord: boolean }

type PreparedField = { source: string; folded: string; midWord: boolean }

type Token = SearchRange & { score: number; pieces: SearchRange[] }

export const WHOLE_WORD = 1
export const WHOLE_TITLE_BONUS = 0.5
export const SEARCH_WORD_LENGTH = 3

const WORD_START = 0.8
const JOINED_WORDS = 0.6
const TYPO = 0.45
const MID_WORD = 0.3
const PHRASE_BONUS = 0.25
const CONTEXT_WEIGHT = 0.25
const MID_WORD_LENGTH = 4
const SNIPPET_LEAD = 24
const SNIPPET_LENGTH = 160

const fillerWords = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
])
const alphanumeric = /[\p{L}\p{N}]/u
const lowercase = /\p{Ll}/u
const uppercase = /\p{Lu}/u
const digit = /\p{N}/u
const letter = /\p{L}/u

function fold(text: string) {
  return text
    .replace(/[\u0080-￿]/g, (character) => {
      const folded = character
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
      return folded.length === 1 ? folded : character
    })
    .toLowerCase()
}

export function searchWords(query: string) {
  return fold(query)
    .replace(/^["'`]+|["'`]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

export function hasSearchableWord(query: string) {
  return searchWords(query).some((word) => word.length >= SEARCH_WORD_LENGTH)
}

function isWordStart(text: string, index: number) {
  const character = text[index]
  const previous = text[index - 1] ?? ''
  const next = text[index + 1] ?? ''
  return (
    alphanumeric.test(character) &&
    (previous === '' ||
      !alphanumeric.test(previous) ||
      (lowercase.test(previous) && uppercase.test(character)) ||
      (uppercase.test(previous) &&
        uppercase.test(character) &&
        lowercase.test(next)) ||
      digit.test(previous) !== digit.test(character))
  )
}

function isWordEnd(text: string, end: number) {
  return (
    end >= text.length ||
    !alphanumeric.test(text[end]) ||
    isWordStart(text, end)
  )
}

function wordEnd(text: string, start: number) {
  let end = start + 1
  while (
    end < text.length &&
    alphanumeric.test(text[end]) &&
    !isWordStart(text, end)
  ) {
    end += 1
  }
  return end
}

function wordStarts(text: string) {
  return Array.from({ length: text.length }, (_, index) => index).filter(
    (index) => isWordStart(text, index)
  )
}

function oneEditApart(left: string, right: string, swapOnly: boolean) {
  let same = 0
  while (
    same < left.length &&
    same < right.length &&
    left[same] === right[same]
  ) {
    same += 1
  }
  const restLeft = left.slice(same)
  const restRight = right.slice(same)
  const swapped =
    restLeft.length > 1 &&
    restLeft[0] === restRight[1] &&
    restLeft[1] === restRight[0] &&
    restLeft.slice(2) === restRight.slice(2)
  if (swapOnly) {
    return swapped
  }
  return (
    swapped ||
    restLeft === restRight ||
    restLeft.slice(1) === restRight.slice(1) ||
    restLeft.slice(1) === restRight ||
    restLeft === restRight.slice(1)
  )
}

function matchJoinedWords(source: string, folded: string, word: string) {
  for (const start of wordStarts(source)) {
    if (folded[start] !== word[0]) {
      continue
    }
    const pieces: SearchRange[] = []
    let at = start
    let rest = word
    while (rest !== '' && at < folded.length) {
      const end = wordEnd(source, at)
      if (rest.length <= end - at && folded.startsWith(rest, at)) {
        pieces.push({ start: at, end: at + rest.length })
        rest = ''
      } else if (rest.startsWith(folded.slice(at, end))) {
        pieces.push({ start: at, end })
        rest = rest.slice(end - at)
        at = end
        while (at < folded.length && !isWordStart(source, at)) {
          at += 1
        }
      } else {
        break
      }
    }
    if (rest === '' && pieces.length > 1) {
      return {
        score: JOINED_WORDS,
        start,
        end: pieces[pieces.length - 1].end,
        pieces,
      }
    }
  }
  return null
}

function matchTypo(source: string, folded: string, word: string) {
  if (word.length < SEARCH_WORD_LENGTH || !letter.test(word)) {
    return null
  }
  const short = word.length <= MID_WORD_LENGTH
  for (const start of wordStarts(source)) {
    const firstKept =
      folded[start] === word[0] ||
      (!short && folded[start] === word[1] && folded[start + 1] === word[0])
    if (!firstKept) {
      continue
    }
    let runEnd = start + 1
    while (runEnd < folded.length && alphanumeric.test(folded[runEnd])) {
      runEnd += 1
    }
    const lengths = short
      ? [word.length, word.length + 1]
      : [word.length, word.length - 1, word.length + 1]
    for (const length of lengths) {
      if (length > runEnd - start) {
        continue
      }
      const candidate = folded.slice(start, start + length)
      if (oneEditApart(word, candidate, short && length === word.length)) {
        const range = { start, end: start + length }
        return { score: TYPO, ...range, pieces: [range] }
      }
    }
  }
  return null
}

function matchWord(
  field: PreparedField,
  word: string,
  options: { primary: boolean; typos: boolean }
): Token | null {
  const source = field.source
  const folded = field.folded
  let best: Token | null = null
  for (
    let index = folded.indexOf(word);
    index !== -1;
    index = folded.indexOf(word, index + 1)
  ) {
    const range = { start: index, end: index + word.length }
    if (isWordStart(source, index)) {
      const score = isWordEnd(source, range.end) ? WHOLE_WORD : WORD_START
      if (best === null || score > best.score) {
        best = { score, ...range, pieces: [range] }
      }
      if (score === WHOLE_WORD) {
        return best
      }
    } else if (
      field.midWord &&
      word.length >= MID_WORD_LENGTH &&
      best === null
    ) {
      best = { score: MID_WORD, ...range, pieces: [range] }
    }
  }
  if (best !== null && best.score > MID_WORD) {
    return best
  }
  const joined = options.primary ? matchJoinedWords(source, folded, word) : null
  if (joined !== null) {
    return joined
  }
  return options.typos ? (matchTypo(source, folded, word) ?? best) : best
}

function mergeRanges(ranges: SearchRange[]) {
  const merged: SearchRange[] = []
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1)
    if (last !== undefined && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function matchFields(
  query: string,
  fields: Field[],
  typos: boolean
): FieldsMatch | null {
  const words = searchWords(query)
  if (words.length === 0) {
    return null
  }
  const prepared = fields
    .filter((field) => field.value !== '')
    .map((field) => ({
      ...field,
      source: field.value,
      folded: fold(field.value),
    }))
  const optional = words.some((word) => !fillerWords.has(word))
  const ranges: SearchRange[] = []
  let total = 0
  let counted = 0
  let strong = true
  for (const word of words) {
    let best = 0
    let wordStrong = false
    for (const [index, field] of prepared.entries()) {
      const match = matchWord(field, word, { primary: index === 0, typos })
      if (match === null) {
        continue
      }
      if (index === 0) {
        ranges.push(...match.pieces)
      }
      if (match.score >= WORD_START && field.weight > CONTEXT_WEIGHT) {
        wordStrong = true
      }
      best = Math.max(best, match.score * field.weight)
    }
    if (best === 0) {
      if (optional && fillerWords.has(word)) {
        continue
      }
      return null
    }
    strong &&= wordStrong
    total += best
    counted += 1
  }
  const title = prepared.at(0)?.folded ?? ''
  const joined = words.join(' ')
  const bonus =
    title === joined
      ? WHOLE_TITLE_BONUS
      : words.length > 1 && title.includes(joined)
        ? PHRASE_BONUS
        : 0
  return {
    quality: total / counted + bonus,
    strong,
    ranges: mergeRanges(ranges),
  }
}

function findWord(text: string, folded: string, word: string) {
  let quality = 0
  let at = -1
  for (
    let index = folded.indexOf(word);
    index !== -1;
    index = folded.indexOf(word, index + 1)
  ) {
    const found = !isWordStart(text, index)
      ? MID_WORD
      : isWordEnd(text, index + word.length)
        ? WHOLE_WORD
        : WORD_START
    if (found > quality) {
      quality = found
      at = index
    }
  }
  return at === -1 ? null : { quality, at }
}

export function matchMessage(query: string, text: string) {
  const words = searchWords(query)
  if (words.length === 0) {
    return null
  }
  const folded = fold(text)
  let quality = WHOLE_WORD
  let offset = text.length
  for (const word of words) {
    const found = findWord(text, folded, word)
    if (
      found === null ||
      (found.quality === MID_WORD && word.length < MID_WORD_LENGTH)
    ) {
      return null
    }
    if (word.length >= SEARCH_WORD_LENGTH) {
      quality = Math.min(quality, found.quality)
    }
    offset = Math.min(offset, found.at)
  }
  const phrase = words.length > 1 ? folded.indexOf(words.join(' ')) : -1
  return phrase === -1
    ? { quality, offset }
    : { quality: quality + PHRASE_BONUS, offset: phrase }
}

export function messageSnippet(text: string, offset: number) {
  let start = Math.max(0, offset - SNIPPET_LEAD)
  const space = text.slice(start, offset).search(/\s/)
  if (start > 0 && space !== -1) {
    start += space + 1
  }
  const shown = text
    .slice(start, start + SNIPPET_LENGTH * 2)
    .replace(/\s+/g, ' ')
    .trim()
  const cut = shown.length > SNIPPET_LENGTH
  return `${start > 0 ? '…' : ''}${shown.slice(0, SNIPPET_LENGTH)}${cut ? '…' : ''}`
}

export function messageRanges(query: string, text: string) {
  const folded = fold(text)
  return mergeRanges(
    searchWords(query)
      .filter((word) => word.length >= SEARCH_WORD_LENGTH)
      .flatMap((word) => {
        const ranges: SearchRange[] = []
        for (
          let index = folded.indexOf(word);
          index !== -1;
          index = folded.indexOf(word, index + word.length)
        ) {
          ranges.push({ start: index, end: index + word.length })
        }
        return ranges
      })
  )
}
