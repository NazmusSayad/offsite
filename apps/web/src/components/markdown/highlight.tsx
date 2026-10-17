import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, type ReactNode, useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useCodeTheme } from '@/lib/theme'

export function Highlight(props: { code: string; language: string }) {
  const [node, setNode] = useState<ReactNode>(null)
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let current = true
    import('@pierre/diffs')
      .then(({ getSharedHighlighter }) =>
        getSharedHighlighter({
          themes: [codeTheme],
          langs: [props.language],
          preferredHighlighter: 'shiki-wasm',
        })
          .then((highlighter) => ({ highlighter, lang: props.language }))
          .catch(() =>
            getSharedHighlighter({
              themes: [codeTheme],
              langs: ['text'],
              preferredHighlighter: 'shiki-wasm',
            }).then((highlighter) => ({ highlighter, lang: 'text' }))
          )
      )
      .then(({ highlighter, lang }) =>
        highlighter.codeToHast(props.code, {
          lang,
          themes: { light: codeTheme, dark: codeTheme },
          defaultColor: false,
          transformers: [
            {
              pre(element) {
                delete element.properties.style
              },
            },
          ],
        })
      )
      .then((tree) => {
        if (current)
          {setNode(
            <div className="chat-markdown-shiki">
              {toJsxRuntime(tree, { Fragment, jsx, jsxs })}
            </div>
          )}
      })
      .catch((error: unknown) => console.error(error))
    return () => {
      current = false
    }
  }, [props.code, props.language, codeTheme])

  if (node !== null) {return node}
  return (
    <pre>
      <code>{props.code}</code>
    </pre>
  )
}
