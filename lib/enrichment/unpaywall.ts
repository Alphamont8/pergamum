import type { SourceRecord } from '@/types'
import { CONTACT_EMAIL } from '@/lib/contact'

const UNPAYWALL_TIMEOUT_MS = 8000
const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2'

interface UnpaywallLocation {
  url_for_pdf?: string | null
  url_for_landing_page?: string | null
  url?: string | null
  version?: string | null
  license?: string | null
}

interface UnpaywallResponse {
  doi?: string
  is_oa?: boolean
  oa_status?: string | null
  best_oa_location?: UnpaywallLocation | null
}

function email(): string {
  return process.env.UNPAYWALL_EMAIL ?? process.env.OPENALEX_MAILTO ?? CONTACT_EMAIL
}

/**
 * Look up open-access locations for a DOI (free; requires a contact email).
 * Set UNPAYWALL_EMAIL (or reuse OPENALEX_MAILTO) in env — no API key.
 */
export async function fetchUnpaywall(doi: string): Promise<Partial<SourceRecord> | null> {
  const normalized = doi.replace(/^https?:\/\/doi\.org\//i, '').trim()
  if (!normalized) return null

  try {
    const url = `${UNPAYWALL_BASE}/${encodeURIComponent(normalized)}?email=${encodeURIComponent(email())}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UNPAYWALL_TIMEOUT_MS),
    })
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn('[unpaywall] lookup failed', res.status, normalized.slice(0, 80))
      }
      return null
    }
    const data = (await res.json()) as UnpaywallResponse
    const loc = data.best_oa_location
    const oaUrl =
      loc?.url_for_pdf || loc?.url_for_landing_page || loc?.url || undefined

    return {
      doi: data.doi ?? normalized,
      openAccess: {
        isOA: Boolean(data.is_oa),
        status: data.oa_status ?? undefined,
        oaUrl: oaUrl ?? undefined,
      },
      // Prefer OA landing/PDF when we only had a DOI resolver URL.
      url: oaUrl,
    }
  } catch (err) {
    console.warn('[unpaywall] request error', err instanceof Error ? err.message : err)
    return null
  }
}
