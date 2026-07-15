/** Canonical production origin (no trailing slash). */
export const PRODUCTION_APP_URL = 'https://pergamum.io'

/** App origin for OAuth redirects, sitemap, and share links. */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) return raw.replace(/\/$/, '')
  return PRODUCTION_APP_URL
}
