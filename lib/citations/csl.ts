import type { SourceKind, SourceRecord } from '@/types'
import { getDateParts, normalizeSourceForCitation, splitAuthorList } from './normalize'

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
  accessed?: { 'date-parts'?: number[][] }
}

function parseAuthorName(
  name: string,
  asLiteral = false,
): { family?: string; given?: string; literal?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { literal: 'Anonymous' }
  // Organizations / teams must stay intact as CSL literals.
  if (asLiteral) return { literal: trimmed }
  if (trimmed.includes(',')) {
    const [family, ...rest] = trimmed.split(',')
    return { family: family.trim(), given: rest.join(',').trim() || undefined }
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
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
    case 'legal-case':
      return 'legal_case'
    case 'webpage':
      return 'webpage'
    default:
      return url ? 'webpage' : 'article'
  }
}

export function sourceToCslItem(source: SourceRecord): CslItem {
  const clean = normalizeSourceForCitation(source)
  const authors = clean.authorships?.length
    ? clean.authorships.map((a) => parseAuthorName(a.name, Boolean(a.literal)))
    : clean.authors
      ? splitAuthorList(clean.authors).map((a) => parseAuthorName(a))
      : // Prefer short title over Anonymous when no byline / org is available.
        [{ literal: clean.title || 'Untitled' }]

  // authorships preferred above; splitAuthorList preserves "Last, First" groups.

  const dateParts = getDateParts(clean)
  const container = clean.venue?.name
  const publisher =
    clean.sourceKind === 'webpage'
      ? undefined
      : clean.venue?.publisher && clean.venue.publisher !== container
        ? clean.venue.publisher
        : clean.publisher && clean.publisher !== container
          ? clean.publisher
          : undefined

  const item: CslItem = {
    id: clean.id,
    type: mapSourceKind(clean.sourceKind, clean.url),
    title: clean.title,
    author: authors,
    publisher,
    'container-title': container,
    URL: clean.url,
    DOI: clean.doi,
    volume: clean.biblio?.volume,
    issue: clean.biblio?.issue,
    page: clean.biblio?.pages,
    abstract: clean.abstract ?? clean.summary,
  }

  if (dateParts?.length) {
    item.issued = { 'date-parts': [dateParts] }
  }

  // Web articles: prefer full issued date; add accessed when date is missing.
  const isArticle =
    clean.sourceKind === 'webpage' ||
    clean.sourceKind === 'report' ||
    (Boolean(clean.url) && clean.sourceKind !== 'journal-article')
  if (isArticle && (!dateParts || dateParts.length < 3)) {
    const now = new Date()
    item.accessed = {
      'date-parts': [[now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]],
    }
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
