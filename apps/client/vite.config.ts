import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { z } from 'zod'

let coreFiles = new Set<string>()

const devEnv = z.object({
  OFFSITE_DEV_SERVER: z.url({ protocol: /^http$/ }),
  OFFSITE_CONNECT: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.url({ protocol: /^https?$/ }))),
})

export default defineConfig({
  define: {
    'process.env.OFFSITE_VERSION': JSON.stringify(
      process.env.OFFSITE_VERSION ?? 'dev'
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'offsite-dev',
      apply: (_, env) => env.command === 'serve' && env.mode !== 'test',
      config: () => {
        const env = devEnv.safeParse(process.env)
        if (!env.success) {
          throw new Error(
            `Start the dev server with pnpm dev from the repository root\n${z.prettifyError(env.error)}`
          )
        }
        return {
          server: {
            proxy: {
              '/ws': { target: env.data.OFFSITE_DEV_SERVER, ws: true },
              '/api': { target: env.data.OFFSITE_DEV_SERVER, ws: true },
            },
          },
        }
      },
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: {
            name: 'offsite-connect',
            content: devEnv.parse(process.env).OFFSITE_CONNECT.join(' '),
          },
          injectTo: 'head',
        },
      ],
    },
    {
      name: 'offsite-core-files',
      apply: 'build',
      generateBundle(_, bundle) {
        const files = Object.values(bundle).flatMap((file) =>
          file.type === 'chunk' && file.isEntry ? [file.fileName] : []
        )
        for (const name of files) {
          const file = bundle[name]
          if (file.type !== 'chunk') {
            continue
          }
          for (const imported of file.imports) {
            if (!files.includes(imported)) {
              files.push(imported)
            }
          }
        }
        coreFiles = new Set(files)
      },
    },
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false,
      devOptions: { enabled: true, type: 'module' },
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        manifestTransforms: [
          (entries) => ({
            manifest: entries.filter(
              (entry) =>
                !(
                  entry.url.startsWith('assets/') && entry.url.endsWith('.js')
                ) || coreFiles.has(entry.url)
            ),
            warnings: [],
          }),
        ],
      },
      manifest: {
        name: 'OffSite',
        short_name: 'OffSite',
        description: 'Claude Code in your browser',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/api/app-icon/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/api/app-icon/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/api/app-icon/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
    },
  },
  server: {
    cors: false,
  },
})
