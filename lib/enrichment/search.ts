import type { SourceSearchResult } from '@/types'
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

async function exaFetch<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) return null

  const res = await fetch(`https://api.exa.ai${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) return null
  return res.json() as Promise<T>
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
      highlights: { numSentences: 2, highlightsPerUrl: 2 },
      text: { maxCharacters: 800 },
    },
  })
  return data?.results ?? []
}

export async function searchAcademicWorks(query: string, perPage = 8): Promise<OpenAlexWork[]> {
  const mailto = process.env.OPENALEX_MAILTO ?? 'contact@pergamum.com'
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${perPage}&mailto=${encodeURIComponent(mailto)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return []
  const data = (await res.json()) as { results?: OpenAlexWork[] }
  return data.results ?? []
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
