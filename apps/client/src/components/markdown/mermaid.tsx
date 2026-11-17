import DOMPurify from 'dompurify'
import type { DiagramType } from 'pele/lazy'
import {
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  use,
  useCallback,
  useLayoutEffect,
  useState,
} from 'react'

const FileViewer = lazy(async () => ({
  default: (await import('@/components/file-viewer')).FileViewer,
}))

type Pele = typeof import('pele/lazy')

type PeleLoad = { status: 'loaded'; pele: Pele } | { status: 'failed' }

let coreLoad: Promise<PeleLoad> | null = null
const diagramLoads = new Map<DiagramType, Promise<PeleLoad>>()
let purifier: ReturnType<typeof DOMPurify> | null = null

const colorVariables = [
  '--pele-bg',
  '--pele-fg',
  '--pele-muted',
  '--pele-line',
  '--pele-surface',
  '--pele-surface-alt',
  '--pele-border',
  '--pele-accent',
  '--pele-critical',
  ...Array.from({ length: 8 }, (_, index) => `--pele-series-${index + 1}`),
]

function loadCore() {
  coreLoad ??= import('pele/lazy').then(
    (pele): PeleLoad => ({ status: 'loaded', pele }),
    (): PeleLoad => ({ status: 'failed' })
  )
  return coreLoad
}

function loadDiagramType(pele: Pele, type: DiagramType) {
  let load = diagramLoads.get(type)
  if (load === undefined) {
    load = pele.load(type).then(
      (): PeleLoad => ({ status: 'loaded', pele }),
      (): PeleLoad => ({ status: 'failed' })
    )
    diagramLoads.set(type, load)
  }
  return load
}

function detectType(pele: Pele, source: string) {
  try {
    return pele.detectType(source)
  } catch {
    return null
  }
}

function sanitize(svg: string) {
  purifier ??= DOMPurify(window)
  return purifier.sanitize(svg, {
    FORBID_ATTR: ['href', 'xlink:href', 'src', 'srcset'],
    FORBID_TAGS: ['a', 'image', 'foreignObject', 'style'],
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM_FRAGMENT: true,
  })
}

export function diagramSvg(root: Element | null) {
  const svg = root?.querySelector('svg')
  if (svg === null || svg === undefined) {
    throw new Error('The diagram is not drawn')
  }
  const copy = svg.cloneNode(true)
  if (!(copy instanceof SVGSVGElement)) {
    throw new Error('The diagram is not an SVG')
  }
  const computed = getComputedStyle(svg)
  for (const name of colorVariables) {
    const value = computed.getPropertyValue(name).trim()
    if (value !== '') {
      copy.style.setProperty(name, value)
    }
  }
  copy.style.maxWidth = 'none'
  copy.style.backgroundColor = getComputedStyle(document.body).backgroundColor
  return new XMLSerializer().serializeToString(copy)
}

export function Diagram(props: {
  code: string
  onError: (code: string) => void
}) {
  return (
    <Suspense
      fallback={
        <pre className="invisible m-0!" aria-hidden>
          {props.code}
        </pre>
      }
    >
      <PeleDiagram code={props.code} onError={props.onError} />
    </Suspense>
  )
}

function PeleDiagram(props: { code: string; onError: (code: string) => void }) {
  const source = props.code.trim()
  const core = use(loadCore())
  const type = core.status === 'loaded' ? detectType(core.pele, source) : null
  const load =
    core.status === 'loaded' && type !== null
      ? use(loadDiagramType(core.pele, type))
      : core
  const failed = load.status === 'failed' || type === null
  const code = props.code
  const onError = props.onError

  useLayoutEffect(() => {
    if (failed) {
      onError(code)
    }
  }, [failed, code, onError])

  const mountDiagram = useCallback(
    (container: HTMLSpanElement) => {
      if (load.status !== 'loaded') {
        return
      }
      const mounted = load.pele.mount(container, source, {
        links: false,
        images: false,
        zoom: false,
        autoDirection: false,
        sanitize,
        onError: () => onError(code),
      })
      return () => mounted.destroy()
    },
    [load, source, code, onError]
  )

  return <span ref={mountDiagram} className="flex w-full justify-center" />
}

export function MermaidDiagram(props: {
  ref: RefObject<HTMLButtonElement | null>
  code: string
  actions: ReactNode
  onError: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={props.ref}
        type="button"
        aria-label="View diagram"
        className="chat-markdown-mermaid focus-visible:ring-ring block w-full cursor-zoom-in overflow-x-auto rounded-lg outline-none focus-visible:ring-2"
        onClick={() => setOpen(true)}
      >
        <Diagram code={props.code} onError={props.onError} />
      </button>
      {open && (
        <Suspense>
          <FileViewer
            name="Mermaid diagram"
            load={async () => ({
              kind: 'image',
              src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(diagramSvg(props.ref.current))}`,
            })}
            actions={props.actions}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
