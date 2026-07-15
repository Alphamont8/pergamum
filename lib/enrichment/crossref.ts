import type { SourceAuthorship, SourceKind, SourceRecord } from '@/types'
import { CONTACT_EMAIL } from '@/lib/contact'

const CROSSREF_TIMEOUT_MS = 8000
const CROSSREF_BASE = 'https://api.crossref.org'

interface CrossrefAuthor {
  given?: string
  family?: string
  name?: string
  ORCID?: string
}

interface CrossrefWork {
  DOI?: string
  title?: string[]
  author?: CrossrefAuthor[]
  published?: { 'date-parts'?: number[][] }
  'published-print'?: { 'date-parts'?: number[][] }
  'published-online'?: { 'date-parts'?: number[][] }
  'container-title'?: string[]
  publisher?: string
  volume?: string
  issue?: string
  page?: string
  type?: string
  ISSN?: string[]
  abstract?: string
  URL?: string
}

function mailto(): string {
  return process.env.OPENALEX_MAILTO ?? process.env.UNPAYWALL_EMAIL ?? CONTACT_EMAIL
}

function mapCrossrefType(type?: string): SourceKind | undefined {
  switch (type) {
    case 'journal-article':
      return 'journal-article'
    case 'book':
    case 'monograph':
      return 'book'
    case 'book-chapter':
      return 'book-chapter'
    case 'posted-content':
      return 'preprint'
    case 'report':
      return 'report'
    case 'dissertation':
      return 'thesis'
    default:
      return undefined
  }
}

function datePartsToFields(parts?: number[][]): { year?: string; publicationDate?: string } {
  if (!parts?.[0]?.length) return {}
  const [y, m, d] = parts[0]
  if (!y) return {}
  const year = String(y)
  if (!m) return { year }
  const publicationDate = [year, String(m).padStart(2, '0'), d ? String(d).padStart(2, '0') : undefined]
    .filter(Boolean)
    .join('-')
  return { year, publicationDate }
}

function stripJats(abstract?: string): string | undefined {
  if (!abstract) return undefined
  const cleaned = abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || undefined
}

/**
 * Resolve bibliographic metadata for a DOI via Crossref (free polite pool).
 * Pass OPENALEX_MAILTO or UNPAYWALL_EMAIL so Crossref can identify the client.
 */
function crossrefWorkToPatch(work: CrossrefWork): Partial<SourceRecord> {
  const authorships: SourceAuthorship[] =
    work.author?.map((a) => {
      const name =
        a.name?.trim() ||
        [a.given, a.family].filter(Boolean).join(' ').trim() ||
        'Unknown'
      return {
        name,
        orcid: a.ORCID?.replace(/^https?:\/\/orcid\.org\//i, ''),
      }
    }) ?? []

  const dateBits =
    datePartsToFields(work.published?.['date-parts']) ||
    datePartsToFields(work['published-print']?.['date-parts']) ||
    datePartsToFields(work['published-online']?.['date-parts'])

  const venueName = work['container-title']?.[0]
  const sourceKind = mapCrossrefType(work.type)
  const abstract = stripJats(work.abstract)
  const doi = work.DOI

  return {
    doi,
    title: work.title?.[0],
    authors: authorships.map((a) => a.name).join(', ') || undefined,
    authorships: authorships.length ? authorships : undefined,
    year: dateBits.year,
    publicationDate: dateBits.publicationDate,
    publisher: work.publisher,
    venue: venueName
      ? {
          name: venueName,
          type: sourceKind === 'journal-article' ? 'journal' : undefined,
          publisher: work.publisher,
          issn: work.ISSN?.[0],
        }
      : undefined,
    biblio:
      work.volume || work.issue || work.page
        ? { volume: work.volume, issue: work.issue, pages: work.page }
        : undefined,
    abstract,
    sourceKind,
    url: work.URL ?? (doi ? `https://doi.org/${doi}` : undefined),
  }
}

/**
 * Look up works by author surname + year via Crossref bibliographic query.
 */
export async function searchCrossrefByAuthorYear(
  author: string,
  year: string,
  options?: { coauthors?: string[]; rows?: number },
): Promise<Partial<SourceRecord>[]> {
  const surname = author.trim().split(/\s+/).filter(Boolean).pop()
  const y = year.slice(0, 4)
  if (!surname || !/^(19|20)\d{2}$/.test(y)) return []

  const bibliographic = [surname, ...(options?.coauthors ?? []).slice(0, 2), y]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')

  try {
    const params = new URLSearchParams({
      'query.author': surname,
      'query.bibliographic': bibliographic,
      filter: `from-pub-date:${y},until-pub-date:${y}`,
      rows: String(options?.rows ?? 8),
      mailto: mailto(),
    })
    const url = `${CROSSREF_BASE}/works?${params.toString()}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `Pergamum/1.0 (mailto:${mailto()})`,
      },
      signal: AbortSignal.timeout(CROSSREF_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('[crossref] author/year search failed', res.status, surname, y)
      return []
    }
    const data = (await res.json()) as { message?: { items?: CrossrefWork[] } }
    const items = data.message?.items ?? []
    const lower = surname.toLowerCase()
    return items
      .map(crossrefWorkToPatch)
      .filter((patch) => {
        const authors = (patch.authors ?? '').toLowerCase()
        const yearOk = (patch.year ?? '').slice(0, 4) === y
        return yearOk && authors.includes(lower)
      })
  } catch (err) {
    console.warn('[crossref] author/year error', err instanceof Error ? err.message : err)
    return []
  }
}

export async function fetchCrossrefWork(doi: string): Promise<Partial<SourceRecord> | null> {
  const normalized = doi.replace(/^https?:\/\/doi\.org\//i, '').trim()
  if (!normalized) return null

  try {
    const url = `${CROSSREF_BASE}/works/${encodeURIComponent(normalized)}?mailto=${encodeURIComponent(mailto())}`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `Pergamum/1.0 (mailto:${mailto()})`,
      },
      signal: AbortSignal.timeout(CROSSREF_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('[crossref] lookup failed', res.status, normalized.slice(0, 80))
      return null
    }
    const data = (await res.json()) as { message?: CrossrefWork }
    const work = data.message
    if (!work) return null

    const patch = crossrefWorkToPatch(work)
    return {
      ...patch,
      doi: patch.doi ?? normalized,
      url: patch.url ?? `https://doi.org/${normalized}`,
    }
  } catch (err) {
    console.warn('[crossref] request error', err instanceof Error ? err.message : err)
    return null
  }
}
