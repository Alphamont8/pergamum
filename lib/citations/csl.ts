import type { SourceKind, SourceRecord } from '@/types'

export interface CslItem {
  id: string
  type: string
  title?: string
  author?: Array<{ family?: string; given?: string; literal?: string }>
  issued?: { 'date-parts'?: number[][] }
  'container-title'?: string
  publisher?: string
  URL?: string
  DOI?: string
  volume?: string
  issue?: string
  page?: string
  abstract?: string
}

function parseAuthorName(name: string): { family?: string; given?: string; literal?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { literal: 'Unknown' }
  if (trimmed.includes(',')) {
    const [family, ...rest] = trimmed.split(',')
    return { family: family.trim(), given: rest.join(',').trim() || undefined }
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { family: parts[0] }
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
}

function mapSourceKind(kind?: SourceKind, url?: string): string {
  switch (kind) {
    case 'journal-article':
      return 'article-journal'
    case 'book':
      return 'book'
    case 'book-chapter':
      return 'chapter'
    case 'preprint':
      return 'article'
    case 'report':
      return 'report'
    case 'thesis':
      return 'thesis'
    case 'webpage':
      return 'webpage'
    default:
      return url ? 'webpage' : 'article'
  }
}

function parseYear(source: SourceRecord): number[] | undefined {
  const raw = source.publicationDate?.slice(0, 4) ?? source.year
  if (!raw) return undefined
  const year = parseInt(raw.replace(/\D/g, '').slice(0, 4), 10)
  return Number.isFinite(year) ? [year] : undefined
}

export function sourceToCslItem(source: SourceRecord): CslItem {
  const authors =
    source.authorships?.map((a) => parseAuthorName(a.name)) ??
    (source.authors
      ? source.authors.split(/(?:,|&| and )+/).map((a) => parseAuthorName(a))
      : [{ literal: 'Unknown' }])

  const yearParts = parseYear(source)
  const item: CslItem = {
    id: source.id,
    type: mapSourceKind(source.sourceKind, source.url),
    title: source.title,
    author: authors,
    publisher: source.venue?.publisher ?? source.publisher,
    'container-title': source.venue?.name,
    URL: source.url,
    DOI: source.doi,
    volume: source.biblio?.volume,
    issue: source.biblio?.issue,
    page: source.biblio?.pages,
    abstract: source.abstract ?? source.summary,
  }

  if (yearParts) {
    item.issued = { 'date-parts': [yearParts] }
  }

  return item
}

export function sourcesToCslItems(sources: SourceRecord[]): Record<string, CslItem> {
  const map: Record<string, CslItem> = {}
  for (const s of sources) {
    map[s.id] = sourceToCslItem(s)
  }
  return map
}
