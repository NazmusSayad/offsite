import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

export default mergeConfig(
  base,
  defineConfig({ test: { environment: 'happy-dom' } })
)
