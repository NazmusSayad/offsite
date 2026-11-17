import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, type ReactNode, useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { logger } from '@/lib/log'
import { useCodeTheme } from '@/lib/theme'

const log = logger.withTag('markdown')

const highlighted = new Map<string, ReactNode>()

export function Highlight(props: { code: string; language: string }) {
  const [node, setNode] = useState<ReactNode>(null)
  const codeTheme = useCodeTheme()
  const key = `${codeTheme}\n${props.language}\n${props.code}`
  const cached = highlighted.get(key)

  useEffect(() => {
    if (highlighted.has(key)) {
      return
    }
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
        const result = (
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
        highlighted.set(key, result)
        const oldest = highlighted.keys().next()
        if (highlighted.size > 500 && !oldest.done) {
          highlighted.delete(oldest.value)
        }
        if (current) {
          setNode(result)
        }
      })
      .catch((error: unknown) => log.error(error))
    return () => {
      current = false
    }
  }, [key, props.code, props.language, codeTheme])

  if (cached !== undefined) {
    return cached
  }
  if (node !== null) {
    return node
  }
  return (
    <div className="chat-markdown-shiki">
      <pre className="shiki invisible" aria-hidden>
        <code>{props.code}</code>
      </pre>
    </div>
  )
}
