import type { NextConfig } from 'next'

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Avoid flaky missing ./vendor-chunks/@opentelemetry.js in dev when .next is partial
  serverExternalPackages: ['@opentelemetry/api'],
}

export default nextConfig
