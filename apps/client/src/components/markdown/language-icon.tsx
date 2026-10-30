import { icons } from '@iconify-json/material-icon-theme'
import {
  FileTypeIcon,
  hasLanguageIcon,
  languageFileName,
} from '@/components/file-icon'

const languageIcons: Record<string, string> = {
  'actionscript-3': 'actionscript',
  'angular-html': 'angular',
  'angular-ts': 'angular',
  asm: 'assembly',
  bat: 'console',
  'common-lisp': 'lisp',
  csv: 'table',
  dotenv: 'tune',
  'emacs-lisp': 'lisp',
  erb: 'ruby',
  fish: 'console',
  'fortran-fixed-form': 'fortran',
  'fortran-free-form': 'fortran',
  gdresource: 'godot',
  gdscript: 'godot',
  gdshader: 'godot',
  'git-commit': 'git',
  'git-rebase': 'git',
  glsl: 'shader',
  hlsl: 'shader',
  'html-derivative': 'html',
  ini: 'settings',
  json5: 'json',
  jsonc: 'json',
  jsonl: 'json',
  jsx: 'react',
  latex: 'tex',
  make: 'makefile',
  mdc: 'markdown',
  mipsasm: 'assembly',
  'nextflow-groovy': 'groovy',
  nushell: 'console',
  plaintext: 'document',
  plsql: 'database',
  rbs: 'ruby',
  riscv: 'assembly',
  scss: 'sass',
  shaderlab: 'shader',
  shellscript: 'console',
  shellsession: 'console',
  sql: 'database',
  'system-verilog': 'verilog',
  text: 'document',
  'ts-tags': 'typescript',
  tsv: 'table',
  tsx: 'react-ts',
  txt: 'document',
  viml: 'vim',
  'vue-html': 'vue',
  'vue-vine': 'vue',
  wasm: 'webassembly',
  wgsl: 'shader',
}

export function LanguageIcon(props: { language: string }) {
  const icon = icons.icons[languageIcons[props.language] ?? props.language]
  if (icon !== undefined) {
    return (
      <svg
        aria-hidden="true"
        className="size-3.5 shrink-0"
        viewBox={`0 0 ${icon.width ?? icons.width ?? 16} ${icon.height ?? icons.height ?? 16}`}
        dangerouslySetInnerHTML={{ __html: icon.body }}
      />
    )
  }
  if (hasLanguageIcon(props.language)) {
    return (
      <FileTypeIcon
        path={languageFileName(props.language)}
        className="size-3.5"
      />
    )
  }
  return null
}
