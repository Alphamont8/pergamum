import type { MetadataRoute } from 'next'
import { getAppUrl } from '@/lib/site'

const BASE = getAppUrl()

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-07-13')

  return [
    { url: `${BASE}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/login`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE}/cookies`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
  ]
}
