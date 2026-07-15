import type { SourceAuthorship, SourceKind, SourceRecord } from '@/types'
import { CONTACT_EMAIL } from '@/lib/contact'

const OPENALEX_BASE = 'https://api.openalex.org'
const MAILTO = process.env.OPENALEX_MAILTO ?? CONTACT_EMAIL

export interface OpenAlexWork {
  id: string
  doi?: string | null
  title?: string
  display_name?: string
  publication_year?: number
  publication_date?: string
  cited_by_count?: number
  fwci?: number | null
  type?: string
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: Array<{
    author?: {
      display_name?: string
      orcid?: string | null
      cited_by_count?: number
      h_index?: number
    }
    institutions?: Array<{ display_name?: string }>
  }>
  primary_location?: {
    source?: {
      display_name?: string
      type?: string
      host_organization_name?: string
      issn_l?: string | null
    }
    landing_page_url?: string
    pdf_url?: string | null
  }
  open_access?: {
    is_oa?: boolean
    oa_status?: string
    oa_url?: string | null
  }
  topics?: Array<{ display_name?: string }>
  biblio?: {
    volume?: string
    issue?: string
    first_page?: string
    last_page?: string
  }
}

function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string | undefined {
  if (!index) return undefined
  const words: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words.push([pos, word])
    }
  }
  words.sort((a, b) => a[0] - b[0])
  return words.map((w) => w[1]).join(' ')
}

function mapOpenAlexType(type?: string): SourceKind {
  switch (type) {
    case 'article':
    case 'review':
      return 'journal-article'
    case 'book':
      return 'book'
    case 'book-chapter':
      return 'book-chapter'
    case 'preprint':
      return 'preprint'
    case 'report':
      return 'report'
    case 'dissertation':
      return 'thesis'
    default:
      return 'other'
  }
}

function extractDoiFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/10\.\d{4,}\/[^\s?#]+/i)
  return match?.[0]
}

async function fetchOpenAlex<T>(path: string): Promise<T | null> {
  const url = `${OPENALEX_BASE}${path}${path.includes('?') ? '&' : '?'}mailto=${encodeURIComponent(MAILTO)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

export async function lookupOpenAlexByDoi(doi: string): Promise<OpenAlexWork | null> {
  const normalized = doi.replace(/^https?:\/\/doi\.org\//i, '')
  return fetchOpenAlex<OpenAlexWork>(`/works/https://doi.org/${encodeURIComponent(normalized)}`)
}

export async function searchOpenAlexByTitle(title: string): Promise<OpenAlexWork | null> {
  const data = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(
    `/works?search=${encodeURIComponent(title)}&per_page=3`,
  )
  const results = data?.results ?? []
  if (results.length === 0) return null
  const normalized = title.toLowerCase().trim()
  return (
    results.find((r) => (r.title ?? r.display_name ?? '').toLowerCase().trim() === normalized) ??
    results[0]
  )
}

/** Find works matching author surname + publication year. */
export async function searchOpenAlexByAuthorYear(
  author: string,
  year: string,
  perPage = 8,
): Promise<OpenAlexWork[]> {
  const surname = author.trim().split(/\s+/).filter(Boolean).pop()
  const y = year.slice(0, 4)
  if (!surname || !/^(19|20)\d{2}$/.test(y)) return []

  const select =
    'id,doi,title,display_name,publication_year,publication_date,cited_by_count,fwci,type,abstract_inverted_index,authorships,primary_location,open_access,topics,biblio'
  const lower = surname.toLowerCase()

  const filterAuthor = async () => {
    const params = new URLSearchParams({
      filter: `publication_year:${y},author.display_name.search:${surname},is_retracted:false`,
      per_page: String(perPage),
      sort: 'cited_by_count:desc',
      select,
    })
    const data = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(`/works?${params.toString()}`)
    return data?.results ?? []
  }

  const searchFallback = async () => {
    const params = new URLSearchParams({
      search: `${surname} ${y}`,
      filter: `publication_year:${y},is_retracted:false`,
      per_page: String(perPage),
      sort: 'relevance_score:desc',
      select,
    })
    const data = await fetchOpenAlex<{ results?: OpenAlexWork[] }>(`/works?${params.toString()}`)
    return data?.results ?? []
  }

  let results = await filterAuthor()
  if (!results.length) results = await searchFallback()

  return results.filter((work) =>
    work.authorships?.some((a) => (a.author?.display_name ?? '').toLowerCase().includes(lower)),
  )
}

export function openAlexWorkToPatch(work: OpenAlexWork): Partial<SourceRecord> {
  const authorships: SourceAuthorship[] =
    work.authorships?.map((a) => ({
      name: a.author?.display_name ?? 'Unknown',
      orcid: a.author?.orcid ?? undefined,
      hIndex: a.author?.h_index,
      institutions: a.institutions?.map((i) => i.display_name ?? '').filter(Boolean),
    })) ?? []

  const authors = authorships.map((a) => a.name).join(', ')
  const venue = work.primary_location?.source
  const pages =
    work.biblio?.first_page && work.biblio?.last_page
      ? `${work.biblio.first_page}-${work.biblio.last_page}`
      : work.biblio?.first_page

  return {
    openAlexId: work.id,
    doi: work.doi?.replace('https://doi.org/', '') ?? undefined,
    title: work.title ?? work.display_name,
    authors: authors || undefined,
    authorships: authorships.length ? authorships : undefined,
    year: work.publication_year?.toString(),
    publicationDate: work.publication_date,
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    citedByCount: work.cited_by_count,
    fwci: work.fwci ?? undefined,
    sourceKind: mapOpenAlexType(work.type),
    venue: venue
      ? {
          name: venue.display_name,
          type: venue.type,
          publisher: venue.host_organization_name,
          issn: venue.issn_l ?? undefined,
        }
      : undefined,
    biblio: work.biblio
      ? {
          volume: work.biblio.volume,
          issue: work.biblio.issue,
          pages,
        }
      : undefined,
    openAccess: work.open_access
      ? {
          isOA: Boolean(work.open_access.is_oa),
          status: work.open_access.oa_status,
          oaUrl: work.open_access.oa_url ?? undefined,
        }
      : undefined,
    topics: work.topics?.map((t) => t.display_name ?? '').filter(Boolean),
    url: work.primary_location?.landing_page_url,
    publisher: venue?.host_organization_name,
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}

export async function enrichFromOpenAlex(source: SourceRecord): Promise<Partial<SourceRecord>> {
  const doi = source.doi ?? extractDoiFromUrl(source.url)
  if (doi) {
    const work = await lookupOpenAlexByDoi(doi)
    if (work) return openAlexWorkToPatch(work)
  }
  if (source.title) {
    const work = await searchOpenAlexByTitle(source.title)
    if (work) return openAlexWorkToPatch(work)
  }
  return { enrichment: { status: 'failed', error: 'No OpenAlex match found' } }
}
