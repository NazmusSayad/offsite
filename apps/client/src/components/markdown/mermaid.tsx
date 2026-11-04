import { createStore, get, set } from 'idb-keyval'
import { lazy, type Ref, Suspense, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { currentScheme } from '@/lib/theme'

const ImageViewer = lazy(async () => ({
  default: (await import('@/components/image-viewer')).ImageViewer,
}))

const database = createStore('offsite-mermaid', 'diagrams')

let diagrams = 0

export function useMermaid(code: string | null) {
  const theme = useStore((state) => state.prefs.theme)
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    if (code === null) {
      return
    }
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const key = `${theme}\n${code}`
    function render(source: string) {
      const scheme = currentScheme()
      import('mermaid')
        .then(({ default: mermaid }) => {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeCSS: `rect.basic, .node rect, .cluster rect, rect.actor { rx: 6px; ry: 6px } * { filter: none !important } .edgeLabel, .edgeLabel p { background-color: var(--mermaid-surface, ${scheme.background}) } .edgeLabel rect, .cluster rect, .relationshipLabelBox { fill: var(--mermaid-surface, ${scheme.background}); opacity: 1 }`,
            themeVariables: {
              darkMode: true,
              fontFamily: getComputedStyle(document.body).fontFamily,
              fontSize: '13px',
              useGradient: false,
              background: scheme.background,
              primaryColor: scheme.selectionBackground,
              primaryTextColor: scheme.foreground,
              primaryBorderColor: scheme.palette[8],
              lineColor: scheme.palette[8],
              textColor: scheme.foreground,
              edgeLabelBackground: scheme.background,
              clusterBkg: scheme.background,
              clusterBorder: scheme.palette[0],
              noteBkgColor: scheme.palette[0],
              noteTextColor: scheme.foreground,
              noteBorderColor: scheme.palette[8],
              pieOpacity: '0.8',
              pieStrokeColor: scheme.background,
              pieOuterStrokeColor: scheme.background,
              pieSectionTextColor: scheme.background,
              ...Object.fromEntries(
                [4, 5, 6, 2, 3, 1].flatMap((color, index) => [
                  [`pie${index + 1}`, scheme.palette[color]],
                  [`git${index}`, scheme.palette[color]],
                  [`cScale${index}`, scheme.palette[color]],
                  [`cScaleLabel${index}`, scheme.background],
                ])
              ),
            },
          })
          diagrams += 1
          return mermaid.render(`mermaid-${diagrams}`, source)
        })
        .then((result) => {
          void set(key, result.svg, database)
          if (current) {
            setSvg(result.svg)
          }
        })
        .catch(() => {
          if (current) {
            setSvg(null)
          }
        })
    }
    void get<string>(key, database).then((cached) => {
      if (!current) {
        return
      }
      if (cached !== undefined) {
        setSvg(cached)
        return
      }
      timer = setTimeout(() => render(code), 400)
    })
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [code, theme])

  return code === null ? null : svg
}

export function MermaidDiagram(props: {
  ref: Ref<HTMLButtonElement>
  svg: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <button
        ref={props.ref}
        type="button"
        aria-label="View diagram"
        className="focus-visible:ring-ring flex w-full cursor-zoom-in justify-center rounded-lg px-3 pt-2 pb-3 outline-none [--mermaid-surface:color-mix(in_srgb,var(--text)_3.2%,var(--bg))] focus-visible:ring-2 [&>svg]:h-auto"
        onClick={() => props.onOpenChange(true)}
        dangerouslySetInnerHTML={{ __html: props.svg }}
      />
      {props.open && (
        <Suspense>
          <ImageViewer
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
              new XMLSerializer().serializeToString(
                new DOMParser().parseFromString(props.svg, 'text/html').body
                  .firstElementChild!
              )
            )}`}
            alt="Diagram"
            name="Mermaid diagram"
            onClose={() => props.onOpenChange(false)}
          />
        </Suspense>
      )}
    </>
  )
}
