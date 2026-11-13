import { FILE_ICON_SPRITE } from '@offsite/core/icons/files'
import {
  createFileTreeIconResolver,
  type FileTreeIcons,
  getBuiltInSpriteSheet,
} from '@pierre/trees'
import { useInsertionEffect } from 'react'
import { cn } from '@/lib/utils'

const resolver = createFileTreeIconResolver({
  set: 'complete',
  colored: true,
  spriteSheet: FILE_ICON_SPRITE,
  byFileName: {
    'package.json': 'file-tree-builtin-npm',
    'tsconfig.json': 'file-tree-builtin-typescript',
    'agents.md': 't3-file-icon-agents',
    'pnpm-lock.yaml': 't3-file-icon-pnpm',
    'pnpm-workspace.yaml': 't3-file-icon-pnpm',
  },
  byFileExtension: {
    avi: 't3-file-icon-video',
    m4v: 't3-file-icon-video',
    mkv: 't3-file-icon-video',
    mov: 't3-file-icon-video',
    mp4: 't3-file-icon-video',
    ogv: 't3-file-icon-video',
    webm: 't3-file-icon-video',
    cs: 't3-file-icon-csharp',
    csx: 't3-file-icon-csharp',
    dart: 't3-file-icon-dart',
    diff: 't3-file-icon-diff',
    patch: 't3-file-icon-diff',
    ex: 't3-file-icon-elixir',
    exs: 't3-file-icon-elixir',
    hs: 't3-file-icon-haskell',
    lhs: 't3-file-icon-haskell',
    java: 't3-file-icon-java',
    kt: 't3-file-icon-kotlin',
    kts: 't3-file-icon-kotlin',
    lua: 't3-file-icon-lua',
    php: 't3-file-icon-php',
    ps1: 't3-file-icon-powershell',
    psm1: 't3-file-icon-powershell',
    psd1: 't3-file-icon-powershell',
    r: 't3-file-icon-r',
    scala: 't3-file-icon-scala',
    toml: 't3-file-icon-toml',
    xml: 't3-file-icon-xml',
  },
} satisfies FileTreeIcons)

const colors: Record<string, [light: string, dark: string]> = {
  astro: ['#a631be', '#d568ea'],
  babel: ['#d5a910', '#ffd452'],
  bash: ['#199f43', '#5ecc71'],
  biome: ['#1a85d4', '#69b1ff'],
  bootstrap: ['#693acf', '#9d6afb'],
  browserslist: ['#d5a910', '#ffd452'],
  bun: ['#594c5b', '#79697b'],
  c: ['#1a85d4', '#69b1ff'],
  claude: ['#d47628', '#ffa359'],
  cpp: ['#1a85d4', '#69b1ff'],
  css: ['#693acf', '#9d6afb'],
  database: ['#a631be', '#d568ea'],
  default: ['#84848a', '#adadb1'],
  docker: ['#1a85d4', '#69b1ff'],
  eslint: ['#693acf', '#9d6afb'],
  git: ['#ff8c5b', '#d5512f'],
  go: ['#1ca1c7', '#68cdf2'],
  graphql: ['#d32a61', '#ff678d'],
  html: ['#d47628', '#ffa359'],
  image: ['#d32a61', '#ff678d'],
  javascript: ['#d5a910', '#ffd452'],
  json: ['#d47628', '#ffa359'],
  markdown: ['#199f43', '#5ecc71'],
  mcp: ['#17a5af', '#64d1db'],
  nextjs: ['#84848a', '#adadb1'],
  npm: ['#d52c36', '#ff6762'],
  oxc: ['#1ca1c7', '#68cdf2'],
  postcss: ['#d52c36', '#ff6762'],
  prettier: ['#17a5af', '#64d1db'],
  python: ['#1a85d4', '#69b1ff'],
  react: ['#1ca1c7', '#68cdf2'],
  ruby: ['#d52c36', '#ff6762'],
  rust: ['#d47628', '#ffa359'],
  sass: ['#d32a61', '#ff678d'],
  stylelint: ['#84848a', '#adadb1'],
  svelte: ['#d52c36', '#ff6762'],
  svg: ['#d47628', '#ffa359'],
  svgo: ['#199f43', '#5ecc71'],
  swift: ['#d47628', '#ffa359'],
  table: ['#17a5af', '#64d1db'],
  tailwind: ['#1ca1c7', '#68cdf2'],
  terraform: ['#693acf', '#9d6afb'],
  text: ['#84848a', '#adadb1'],
  typescript: ['#1a85d4', '#69b1ff'],
  vite: ['#a631be', '#d568ea'],
  vscode: ['#1a85d4', '#69b1ff'],
  vue: ['#199f43', '#5ecc71'],
  wasm: ['#693acf', '#9d6afb'],
  webpack: ['#1a85d4', '#69b1ff'],
  yml: ['#d52c36', '#ff6762'],
  zig: ['#d47628', '#ffa359'],
  zip: ['#d47628', '#ffa359'],
}

const languageExtensions: Record<string, string> = {
  bash: 'sh',
  csharp: 'cs',
  elixir: 'ex',
  haskell: 'hs',
  javascript: 'js',
  kotlin: 'kt',
  markdown: 'md',
  plaintext: 'txt',
  powershell: 'ps1',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  shell: 'sh',
  shellscript: 'sh',
  typescript: 'ts',
  yaml: 'yml',
}

export function FileTypeIcon(props: { path: string; className?: string }) {
  useInsertionEffect(insertSprite, [])
  const icon = resolver.resolveIcon('file-tree-icon-file', props.path)
  const color = colors[icon.token ?? 'default'] ?? colors.default
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 shrink-0', props.className)}
      style={{ color: `light-dark(${color[0]}, ${color[1]})` }}
      viewBox="0 0 16 16"
    >
      <use href={`#${icon.name}`} />
    </svg>
  )
}

export function languageFileName(language: string) {
  const normalized = language.toLowerCase()
  if (normalized === 'dockerfile') {
    return 'Dockerfile'
  }
  return `file.${languageExtensions[normalized] ?? normalized}`
}

export function hasLanguageIcon(language: string) {
  return (
    resolver.resolveIcon('file-tree-icon-file', languageFileName(language))
      .token !== 'default'
  )
}

function insertSprite() {
  if (document.getElementById('file-icon-sprite') !== null) {
    return
  }
  const container = document.createElement('div')
  container.id = 'file-icon-sprite'
  container.setAttribute('aria-hidden', 'true')
  container.style.position = 'absolute'
  container.style.width = '0'
  container.style.height = '0'
  container.style.overflow = 'hidden'
  container.style.pointerEvents = 'none'
  container.innerHTML = `${getBuiltInSpriteSheet('complete')}${FILE_ICON_SPRITE}`
  document.body.prepend(container)
}
