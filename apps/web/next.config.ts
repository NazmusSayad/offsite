import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  allowedDevOrigins: ['**.*'],
}

export default createMDX()(config)
