import type { NextConfig } from 'next'

export default {
  output: 'export',
  images: { unoptimized: true },
  allowedDevOrigins: ['**.*'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
} satisfies NextConfig
