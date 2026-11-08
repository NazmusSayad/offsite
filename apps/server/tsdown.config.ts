import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { main: './src/main.ts' },
  outDir: './dist',
  tsconfig: './tsconfig.json',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  dts: false,
  sourcemap: true,
  minify: 'dce-only',
  define: {
    'process.env.OFFSITE_VERSION': JSON.stringify(
      process.env.OFFSITE_VERSION ?? 'dev'
    ),
  },
})
