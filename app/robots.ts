import type { MetadataRoute } from 'next'
import { getAppUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl()

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/privacy', '/terms', '/cookies'],
      disallow: [
        '/api/',
        '/settings',
        '/cites',
        '/c/',
        '/onboarding',
        '/leaderboard',
        '/upgrade',
        '/help',
      ],
    },
    sitemap: `${base.replace(/\/$/, '')}/sitemap.xml`,
  }
}
