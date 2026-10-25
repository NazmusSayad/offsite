import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'offsite-connect',
      apply: 'serve',
      transformIndexHtml: () =>
        process.env.OFFSITE_CONNECT === undefined
          ? []
          : [
              {
                tag: 'meta',
                attrs: {
                  name: 'offsite-connect',
                  content: process.env.OFFSITE_CONNECT.split(',').join(' '),
                },
                injectTo: 'head',
              },
            ],
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
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
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
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:47842', ws: true },
      '/api': 'http://127.0.0.1:47842',
    },
  },
})
