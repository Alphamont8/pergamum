import { fetchCrossrefWork } from '@/lib/enrichment/crossref'
import { fetchUnpaywall } from '@/lib/enrichment/unpaywall'
import type { SourceRecord } from '@/types'

function extractDoi(source: SourceRecord): string | undefined {
  if (source.doi) return source.doi.replace(/^https?:\/\/doi\.org\//i, '').trim()
  if (!source.url) return undefined
  const match = source.url.match(/10\.\d{4,}\/[^\s?#]+/i)
  return match?.[0]
}

export function needsDoiEnrichment(source: SourceRecord): boolean {
  return Boolean(
    !source.authors ||
      !source.year ||
      !source.publicationDate ||
      !source.venue?.name ||
      !source.biblio?.volume ||
      !(source.abstract && source.abstract.length >= 200) ||
      source.openAccess?.oaUrl == null,
  )
}

/**
 * Merge Crossref bibliographic fields + Unpaywall OA links onto a source that has a DOI.
 * Crossref wins on biblio; Unpaywall wins on openAccess / OA URL.
 */
export async function enrichFromDoi(source: SourceRecord): Promise<SourceRecord> {
  const doi = extractDoi(source)
  if (!doi || !needsDoiEnrichment(source)) return source

  const [crossref, unpaywall] = await Promise.all([
    fetchCrossrefWork(doi),
    fetchUnpaywall(doi),
  ])

  if (!crossref && !unpaywall) return source

  return {
    ...source,
    doi: crossref?.doi || unpaywall?.doi || source.doi || doi,
    title: source.title || crossref?.title || source.title,
    authors: source.authors || crossref?.authors,
    authorships: source.authorships?.length ? source.authorships : crossref?.authorships,
    year: source.year || crossref?.year,
    publicationDate: source.publicationDate || crossref?.publicationDate,
    publisher: source.publisher || crossref?.publisher,
    venue: source.venue?.name ? source.venue : crossref?.venue ?? source.venue,
    biblio: source.biblio?.volume || source.biblio?.pages ? source.biblio : crossref?.biblio ?? source.biblio,
    abstract: (source.abstract && source.abstract.length >= 200
      ? source.abstract
      : crossref?.abstract) || source.abstract,
    sourceKind: source.sourceKind || crossref?.sourceKind,
    openAccess: unpaywall?.openAccess
      ? {
          isOA: unpaywall.openAccess.isOA || Boolean(source.openAccess?.isOA),
          status: unpaywall.openAccess.status ?? source.openAccess?.status,
          oaUrl: unpaywall.openAccess.oaUrl ?? source.openAccess?.oaUrl,
        }
      : source.openAccess,
    url:
      source.url && !/doi\.org/i.test(source.url)
        ? source.url
        : unpaywall?.url || crossref?.url || source.url,
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}
