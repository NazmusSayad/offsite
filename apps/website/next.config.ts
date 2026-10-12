import type { NextConfig } from 'next'

export default {
  allowedDevOrigins: ['**.*'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
} satisfies NextConfig
