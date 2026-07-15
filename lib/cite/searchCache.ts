/**
 * Generation-scoped cache for OpenAlex + Perplexity searches.
 * Concurrent sentences sharing a normalized query reuse one in-flight request.
 */

import type { OpenAlexWork } from '@/lib/enrichment/openalex'
import type { PerplexitySearchResult } from '@/lib/enrichment/perplexity'

export interface CitationSearchCache {
  openAlex: Map<string, Promise<OpenAlexWork[]>>
  perplexity: Map<string, Promise<PerplexitySearchResult[]>>
}

export function createCitationSearchCache(): CitationSearchCache {
  return {
    openAlex: new Map(),
    perplexity: new Map(),
  }
}

export function searchCacheKey(query: string, ...parts: Array<string | number | boolean | undefined>): string {
  return [query.trim().toLowerCase().replace(/\s+/g, ' '), ...parts.map((p) => String(p ?? ''))].join('|')
}

export async function cachedOpenAlexSearch(
  cache: CitationSearchCache | undefined,
  key: string,
  fetchFn: () => Promise<OpenAlexWork[]>,
): Promise<OpenAlexWork[]> {
  if (!cache) return fetchFn()
  const existing = cache.openAlex.get(key)
  if (existing) return existing
  const pending = fetchFn().catch((err) => {
    cache.openAlex.delete(key)
    throw err
  })
  cache.openAlex.set(key, pending)
  return pending
}

export async function cachedPerplexitySearch(
  cache: CitationSearchCache | undefined,
  key: string,
  fetchFn: () => Promise<PerplexitySearchResult[]>,
): Promise<PerplexitySearchResult[]> {
  if (!cache) return fetchFn()
  const existing = cache.perplexity.get(key)
  if (existing) return existing
  const pending = fetchFn().catch((err) => {
    cache.perplexity.delete(key)
    throw err
  })
  cache.perplexity.set(key, pending)
  return pending
}
