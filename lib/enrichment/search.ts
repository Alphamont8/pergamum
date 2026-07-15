import type { SourceSearchResult } from '@/types'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { OpenAlexWork } from './openalex'

export interface ExaSearchResult {
  title?: string
  url?: string
  author?: string
  publishedDate?: string
  text?: string
  highlights?: string[]
  score?: number
}

const SEARCH_TIMEOUT_MS = 10000

async function exaFetch<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(`https://api.exa.ai${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn('[exa] request failed', path, res.status)
      return null
    }
    return res.json() as Promise<T>
  } catch (err) {
    console.warn('[exa] request error', err instanceof Error ? err.message : err)
    return null
  }
}

export async function searchWeb(
  query: string,
  options?: { category?: string; numResults?: number },
): Promise<ExaSearchResult[]> {
  const data = await exaFetch<{ results?: ExaSearchResult[] }>('/search', {
    query,
    type: 'auto',
    numResults: options?.numResults ?? 8,
    ...(options?.category ? { category: options.category } : {}),
    contents: {
      highlights: { numSentences: 3, highlightsPerUrl: 3 },
      text: { maxCharacters: 2000 },
      // Prefer fresher crawls so author/date fields are more often populated.
      maxAgeHours: 24,
    },
  })
  return data?.results ?? []
}

export async function searchAcademicWorks(
  query: string,
  perPage = 8,
  options?: {
    recency?: 'any' | '10y' | '5y'
    sourceTier?: 'any' | 'academic'
    /** When true, drop loose webpage-like types (preprints kept). */
    preferPeerReviewed?: boolean
    /** Keyword (default) or OpenAlex embedding semantic search. */
    mode?: 'keyword' | 'semantic'
  },
): Promise<OpenAlexWork[]> {
  const mailto = process.env.OPENALEX_MAILTO ?? CONTACT_EMAIL
  const apiKey = process.env.OPENALEX_API_KEY?.trim()
  const mode = options?.mode ?? 'keyword'
  const filters: string[] = ['is_retracted:false']

  if (options?.sourceTier === 'academic' || options?.preferPeerReviewed) {
    filters.push('type:article|review|book-chapter|book')
  }

  if (options?.recency === '5y' || options?.recency === '10y') {
    const years = options.recency === '5y' ? 5 : 10
    const from = new Date()
    from.setFullYear(from.getFullYear() - years)
    filters.push(`from_publication_date:${from.toISOString().slice(0, 10)}`)
  }

  const cappedQuery =
    mode === 'semantic' ? query.trim().slice(0, 2000) : query.trim()
  if (!cappedQuery) return []

  const params = new URLSearchParams({
    per_page: String(Math.min(perPage, mode === 'semantic' ? 50 : 100)),
    mailto,
    filter: filters.join(','),
    select:
      'id,doi,title,display_name,publication_year,publication_date,cited_by_count,fwci,type,abstract_inverted_index,authorships,primary_location,open_access,topics,biblio',
  })

  if (mode === 'semantic') {
    params.set('search.semantic', cappedQuery)
    if (apiKey) params.set('api_key', apiKey)
  } else {
    params.set('search', cappedQuery)
    params.set('sort', 'relevance_score:desc')
  }

  const url = `https://api.openalex.org/works?${params.toString()}`
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(
        '[openalex]',
        mode,
        'search failed',
        res.status,
        cappedQuery.slice(0, 80),
      )
      return []
    }
    const data = (await res.json()) as { results?: OpenAlexWork[] }
    return data.results ?? []
  } catch (err) {
    console.warn('[openalex] request error', err instanceof Error ? err.message : err)
    return []
  }
}

function openAlexToSearchResult(work: OpenAlexWork): SourceSearchResult {
  const authors =
    work.authorships
      ?.map((a) => a.author?.display_name)
      .filter(Boolean)
      .join(', ') ?? undefined
  const url =
    work.primary_location?.landing_page_url ??
    (work.doi ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//i, '')}` : undefined)
  const abstract = work.abstract_inverted_index
    ? Object.entries(work.abstract_inverted_index)
        .flatMap(([word, positions]) => positions.map((p) => [p, word] as [number, string]))
        .sort((a, b) => a[0] - b[0])
        .map(([, word]) => word)
        .join(' ')
    : undefined

  return {
    title: work.title ?? work.display_name ?? 'Untitled work',
    url: url ?? '',
    authors,
    year: work.publication_year?.toString(),
    summary: abstract?.slice(0, 500) ?? '',
    quotes: abstract ? [abstract.slice(0, 200)] : [],
    type: 'secondary',
    publisher: work.primary_location?.source?.display_name,
  }
}

function exaToSearchResult(result: ExaSearchResult): SourceSearchResult {
  return {
    title: result.title ?? result.url ?? 'Untitled',
    url: result.url ?? '',
    authors: result.author,
    year: result.publishedDate?.slice(0, 4),
    summary: result.text?.slice(0, 500) ?? result.highlights?.join(' ') ?? '',
    quotes: result.highlights ?? (result.text ? [result.text.slice(0, 200)] : []),
    type: 'secondary',
  }
}

function dedupeKey(r: SourceSearchResult): string {
  const url = r.url?.trim().toLowerCase()
  if (url) return `url:${url}`
  return `title:${r.title.trim().toLowerCase()}`
}

export function mergeSearchResults(
  exaResults: ExaSearchResult[],
  openAlexWorks: OpenAlexWork[],
): SourceSearchResult[] {
  const merged = new Map<string, SourceSearchResult>()

  for (const work of openAlexWorks) {
    const result = openAlexToSearchResult(work)
    merged.set(dedupeKey(result), result)
  }

  for (const item of exaResults) {
    const result = exaToSearchResult(item)
    const key = dedupeKey(result)
    if (!merged.has(key)) {
      merged.set(key, result)
    }
  }

  return Array.from(merged.values())
}

export async function searchAllSources(
  webQuery: string,
  academicQuery: string,
): Promise<SourceSearchResult[]> {
  const [exaResults, openAlexWorks] = await Promise.all([
    searchWeb(webQuery, { numResults: 6 }),
    searchAcademicWorks(academicQuery, 6),
  ])
  return mergeSearchResults(exaResults, openAlexWorks)
}
