import type { Configuration } from 'lint-staged'

export default {
  '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}': ['oxlint', () => 'pnpm typecheck'],
} satisfies Configuration
