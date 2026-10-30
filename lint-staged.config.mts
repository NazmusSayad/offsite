import type { Configuration } from 'lint-staged'

export default {
  '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}': [
    'oxlint --no-error-on-unmatched-pattern',
    () => 'pnpm typecheck',
  ],
} satisfies Configuration
