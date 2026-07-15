/**
 * Perplexity Search API (NOT Sonar chat completions).
 *
 * Endpoint: POST https://api.perplexity.ai/search
 * Pricing: $5.00 / 1,000 requests = $0.005 per request (flat; no token surcharges).
 * @see https://docs.perplexity.ai/api-reference/search-post
 * @see https://docs.perplexity.ai/docs/getting-started/pricing
 */

export const PERPLEXITY_SEARCH_API_URL = 'https://api.perplexity.ai/search' as const

/** Flat cost per Search API request (USD). */
export const PERPLEXITY_SEARCH_COST_PER_REQUEST_USD = 0.005

const PERPLEXITY_TIMEOUT_MS = 12_000

/** Page text budget per result (`max_tokens_per_page` on ApiSearchRequest). */
const PERPLEXITY_TOKENS_PER_PAGE = 256

/** Academic-leaning domains when source tier is academic-only. */
const ACADEMIC_DOMAINS = [
  'nih.gov',
  'nature.com',
  'sciencedirect.com',
  'springer.com',
  'link.springer.com',
  'wiley.com',
  'jstor.org',
  'academic.oup.com',
  'cambridge.org',
  'tandfonline.com',
  'sagepub.com',
  'science.org',
  'pnas.org',
  'plos.org',
  'frontiersin.org',
  'bmj.com',
  'thelancet.com',
  'ieee.org',
  'dl.acm.org',
  'worldbank.org',
]

/** Official Search API request body (`ApiSearchRequest`). */
export interface PerplexitySearchRequest {
  query: string
  max_results?: number
  max_tokens_per_page?: number
  search_domain_filter?: string[]
  search_recency_filter?: 'hour' | 'day' | 'week' | 'month' | 'year'
}

export interface PerplexitySearchResult {
  title: string
  url: string
  snippet: string
  date?: string | null
  last_updated?: string | null
}

export interface PerplexitySearchResponse {
  id: string
  results: PerplexitySearchResult[]
  server_time?: string | null
}

export function isPerplexityConfigured(): boolean {
  return Boolean(process.env.PERPLEXITY_API_KEY)
}

function recencyToPerplexityFilter(
  recency: 'any' | '10y' | '5y',
): PerplexitySearchRequest['search_recency_filter'] | undefined {
  if (recency === '5y') return 'year'
  return undefined
}

function buildSearchRequest(
  query: string,
  options?: { maxResults?: number; academicOnly?: boolean; recency?: 'any' | '10y' | '5y' },
): PerplexitySearchRequest {
  const body: PerplexitySearchRequest = {
    query,
    max_results: Math.min(20, Math.max(1, options?.maxResults ?? 10)),
    max_tokens_per_page: PERPLEXITY_TOKENS_PER_PAGE,
  }
  if (options?.academicOnly) body.search_domain_filter = ACADEMIC_DOMAINS
  const recencyFilter = options?.recency ? recencyToPerplexityFilter(options.recency) : undefined
  if (recencyFilter) body.search_recency_filter = recencyFilter
  return body
}

/**
 * One Search API request → ranked `results[]` with title/url/snippet.
 * Each call is billed at PERPLEXITY_SEARCH_COST_PER_REQUEST_USD.
 */
export async function searchPerplexity(
  query: string,
  options?: { maxResults?: number; academicOnly?: boolean; recency?: 'any' | '10y' | '5y' },
): Promise<PerplexitySearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return []

  const trimmed = query.replace(/\s+/g, ' ').trim()
  if (trimmed.length < 3) return []

  const body = buildSearchRequest(trimmed, options)

  try {
    const res = await fetch(PERPLEXITY_SEARCH_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PERPLEXITY_TIMEOUT_MS),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.warn('[perplexity:search]', res.status, errText.slice(0, 120), trimmed.slice(0, 80))
      return []
    }
    const data = (await res.json()) as PerplexitySearchResponse
    return (data.results ?? []).filter((r) => r.url && r.title)
  } catch (err) {
    console.warn('[perplexity:search] request error', err instanceof Error ? err.message : err)
    return []
  }
}
