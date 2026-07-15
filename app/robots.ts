import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://pergamum.app'

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
