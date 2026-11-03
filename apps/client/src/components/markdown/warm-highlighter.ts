import { currentScheme } from '@/lib/theme'

const languages = ['typescript', 'tsx', 'javascript']

const sample = `import { readFile } from 'node:fs/promises'
import type { Config } from './config'

export interface Entry<T> {
  readonly id: string
  value?: T | null
  tags: Array<string>
}

type Status = 'idle' | 'running' | \`done-\${number}\`

enum Mode { Fast = 1, Slow }

export class Store<T extends object> extends Base implements Disposable {
  #items = new Map<string, Entry<T>>()
  private static count = 0
  constructor(private readonly config: Config) {
    super()
  }
  async load(path: string): Promise<T[]> {
    const text = await readFile(path, 'utf8')
    const data = JSON.parse(text) as T[]
    for (const [index, item] of data.entries()) {
      if (index % 2 === 0 && item !== undefined) continue
    }
    return data.filter((item) => item != null).map(({ ...rest }) => rest)
  }
}

export function List(props: { items: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <ul className="list" onClick={() => setOpen(!open)}>
      {props.items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

export default function run(...args: number[]): void {
  const pattern = /^[a-z]+\\d*$/gi
  let total = 0n
  try {
    total += BigInt(args.length ?? 0)
  } catch (error: unknown) {
    console.error(\`failed: \${String(error)}\`, pattern.test('x'))
  } finally {
    // done
  }
}`

export async function warmHighlighter() {
  await idle()
  const diffs = await import('@pierre/diffs')
  for (const language of languages) {
    await idle()
    const codeTheme = currentScheme().codeTheme
    const highlighter = await diffs.getSharedHighlighter({
      themes: [codeTheme],
      langs: [language],
      preferredHighlighter: 'shiki-wasm',
    })
    highlighter.codeToTokens(sample, {
      lang: language,
      themes: { dark: codeTheme },
      defaultColor: false,
    })
  }
}

function idle() {
  return new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => resolve())
      return
    }
    setTimeout(resolve, 1000)
  })
}
