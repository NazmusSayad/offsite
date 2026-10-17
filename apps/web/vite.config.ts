import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:47842', ws: true },
    },
  },
})
