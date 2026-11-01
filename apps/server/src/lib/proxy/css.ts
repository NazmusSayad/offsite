export function rewriteCss(source: string, rewrite: (url: string) => string) {
  return source
    .replace(
      /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (_match, quote: string, value: string) =>
        `url(${quote}${rewrite(value)}${quote})`
    )
    .replace(
      /@import\s+(['"])(.*?)\1/gi,
      (_match, quote: string, value: string) =>
        `@import ${quote}${rewrite(value)}${quote}`
    )
}
