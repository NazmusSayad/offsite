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
      .then(({ getSharedHighlighter, renderTokenLines }) =>
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
          .then(({ highlighter, lang }) => {
            const result = highlighter.codeToTokens(props.code, {
              lang,
              themes: { dark: codeTheme },
              defaultColor: false,
            })
            return renderTokenLines(result.tokens, {}).flatMap((line, index) =>
              index === 0
                ? [line]
                : [{ type: 'text' as const, value: '\n' }, line]
            )
          })
      )
      .then((lines) => {
        if (current) {
          setNode(
            <div className="chat-markdown-shiki">
              {toJsxRuntime(
                {
                  type: 'element',
                  tagName: 'pre',
                  properties: { className: ['shiki'] },
                  children: [
                    {
                      type: 'element',
                      tagName: 'code',
                      properties: {},
                      children: lines,
                    },
                  ],
                },
                { Fragment, jsx, jsxs }
              )}
            </div>
          )
        }
      })
      .catch((error: unknown) => console.error(error))
    return () => {
      current = false
    }
  }, [props.code, props.language, codeTheme])

  if (node !== null) {
    return node
  }
  return (
    <pre>
      <code>{props.code}</code>
    </pre>
  )
}
