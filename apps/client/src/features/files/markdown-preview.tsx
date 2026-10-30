import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { Components } from 'react-markdown'
import { Markdown } from '@/components/markdown/markdown'
import { monaco } from '@/features/files/monaco'
import { mediaUrl } from '@/lib/media'

export function MarkdownPreview(props: {
  machine: string
  projectId: string
  path: string
  model: monaco.editor.ITextModel
  editor: monaco.editor.ICodeEditor
  onOpen: (path: string) => void
}) {
  const model = props.model
  const editor = props.editor
  const machine = props.machine
  const projectId = props.projectId
  const path = props.path
  const scroller = useRef<HTMLDivElement>(null)
  const subscribe = useCallback(
    (notify: () => void) => {
      const listener = model.onDidChangeContent(notify)
      return () => listener.dispose()
    },
    [model]
  )
  const text = useDeferredValue(
    useSyncExternalStore(subscribe, () => model.getValue())
  )
  const components = useMemo<Components>(
    () => ({
      img(image) {
        return (
          <PreviewImage
            machine={machine}
            projectId={projectId}
            file={path}
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
          />
        )
      },
    }),
    [machine, projectId, path]
  )

  useEffect(() => {
    const listener = editor.onDidScrollChange((event) => {
      const element = scroller.current
      if (
        element === null ||
        !event.scrollTopChanged ||
        element.matches(':hover')
      ) {
        return
      }
      element.scrollTop =
        (event.scrollTop /
          (editor.getScrollHeight() - editor.getLayoutInfo().height)) *
        (element.scrollHeight - element.clientHeight)
    })
    return () => listener.dispose()
  }, [editor])

  return (
    <div
      ref={scroller}
      className="border-sidebar-border bg-background min-w-0 flex-1 overflow-y-auto border-l p-6"
      onScroll={(event) => {
        const element = event.currentTarget
        if (!element.matches(':hover')) {
          return
        }
        editor.setScrollTop(
          (element.scrollTop / (element.scrollHeight - element.clientHeight)) *
            (editor.getScrollHeight() - editor.getLayoutInfo().height),
          monaco.editor.ScrollType.Immediate
        )
      }}
      onClickCapture={(event) => {
        const anchor =
          event.target instanceof Element ? event.target.closest('a') : null
        const href = anchor?.getAttribute('href') ?? null
        if (href === null || isExternal(href)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (href.startsWith('#')) {
          headingFor(event.currentTarget, href.slice(1))?.scrollIntoView()
          return
        }
        props.onOpen(projectPath(path, href))
      }}
    >
      <Markdown
        text={text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '')}
        components={components}
      />
    </div>
  )
}

function PreviewImage(props: {
  machine: string
  projectId: string
  file: string
  src: string | undefined
  alt: string | undefined
  width: string | number | undefined
  height: string | number | undefined
}) {
  const src = props.src ?? ''
  const external = isExternal(src)
  const [local, setLocal] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (external) {
      return
    }
    let current = true
    async function load() {
      try {
        const url = await mediaUrl(
          props.machine,
          props.projectId,
          projectPath(props.file, src)
        )
        if (current) {
          setLocal(url)
        }
      } catch {
        if (current) {
          setLocal(undefined)
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [external, props.machine, props.projectId, props.file, src])

  return (
    <img
      src={external ? src : local}
      alt={props.alt}
      width={props.width}
      height={props.height}
      className="max-w-full"
    />
  )
}

function isExternal(href: string) {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)
}

function projectPath(file: string, href: string) {
  const base = file.split('/').map(encodeURIComponent).join('/')
  const pathname = new URL(href, `file:///${base}`).pathname.slice(1)
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function headingFor(container: Element, fragment: string) {
  return [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].find(
    (heading) => slug(heading.textContent) === fragment.toLowerCase()
  )
}

function slug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replaceAll(/\s/g, '-')
}
