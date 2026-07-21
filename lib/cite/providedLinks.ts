/**
 * Resolve user-provided source links (DOI / publisher URLs) into SourceRecords
 * so the citation pipeline can skip discovery search.
 */
import type { SourceRecord } from '@/types'
import { enrichFromDoi } from '@/lib/enrichment/doi'
import { fetchCrossrefWork } from '@/lib/enrichment/crossref'
import { lookupOpenAlexByDoi, openAlexWorkToPatch } from '@/lib/enrichment/openalex'
import { fetchPageMetadata } from '@/lib/enrichment/exa'
import { normalizeSourceForCitation } from '@/lib/citations/normalize'

const DOI_IN_TEXT = /\b(10\.\d{4,}(?:\.\d+)*\/[^\s)\]>"']+)/i
const DOI_URL = /https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,}(?:\.\d+)*\/[^\s)\]>"']+)/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi

function normalizeDoi(raw: string): string {
  return raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[.,;:)+]+$/, '')
    .trim()
}

/** Split a paste box into unique URL / DOI strings. */
export function parseProvidedLinks(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  const found: string[] = []
  const seen = new Set<string>()

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const doiUrl = trimmed.match(DOI_URL)
    if (doiUrl?.[1]) {
      const doi = normalizeDoi(doiUrl[1])
      if (!seen.has(doi.toLowerCase())) {
        seen.add(doi.toLowerCase())
        found.push(`https://doi.org/${doi}`)
      }
      continue
    }
    const bareDoi = trimmed.match(DOI_IN_TEXT)
    if (bareDoi?.[1] && !trimmed.includes(' ')) {
      const doi = normalizeDoi(bareDoi[1])
      if (!seen.has(doi.toLowerCase())) {
        seen.add(doi.toLowerCase())
        found.push(`https://doi.org/${doi}`)
      }
      continue
    }
    const urls = trimmed.match(URL_RE) ?? (trimmed.startsWith('http') ? [trimmed] : [])
    for (const url of urls) {
      const cleaned = url.replace(/[.,;:)+]+$/, '')
      const key = cleaned.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        found.push(cleaned)
      }
    }
    // Bare DOI alone on a line
    if (/^10\.\d{4,}/.test(trimmed)) {
      const doi = normalizeDoi(trimmed)
      if (!seen.has(doi.toLowerCase())) {
        seen.add(doi.toLowerCase())
        found.push(`https://doi.org/${doi}`)
      }
    }
  }

  return found.slice(0, 20)
}

function extractDoiFromUrl(url: string): string | null {
  const fromDoiOrg = url.match(DOI_URL)
  if (fromDoiOrg?.[1]) return normalizeDoi(fromDoiOrg[1])
  const embedded = url.match(DOI_IN_TEXT)
  if (embedded?.[1]) return normalizeDoi(embedded[1])
  return null
}

async function resolveOneLink(link: string, index: number): Promise<SourceRecord | null> {
  const doi = extractDoiFromUrl(link) || (/^10\.\d{4,}/.test(link) ? normalizeDoi(link) : null)

  if (doi) {
    try {
      const [oa, cr] = await Promise.all([
        lookupOpenAlexByDoi(doi).catch(() => null),
        fetchCrossrefWork(doi).catch(() => null),
      ])
      let record: SourceRecord = {
        id: `provided-${index}-${doi}`,
        title: cr?.title ?? oa?.display_name ?? 'Untitled',
        type: 'secondary',
        doi,
        url: `https://doi.org/${doi}`,
        ...(oa ? openAlexWorkToPatch(oa) : {}),
        ...(cr
          ? {
              authors: cr.authors ?? undefined,
              year: cr.year ?? undefined,
              publicationDate: cr.publicationDate ?? undefined,
              venue: cr.venue,
              publisher: cr.publisher,
              biblio: cr.biblio,
              abstract: cr.abstract,
            }
          : {}),
      }
      record = await enrichFromDoi(record)
      return normalizeSourceForCitation(record)
    } catch {
      return null
    }
  }

  // Non-DOI URL — fetch page metadata so authors/dates aren't left blank.
  try {
    const host = new URL(link).hostname.replace(/^www\./, '')
    const meta = await fetchPageMetadata(link, { maxAgeHours: 24 }).catch(() => null)
    const siteName = meta?.siteName || host
    return normalizeSourceForCitation({
      id: `provided-url-${index}`,
      title: meta?.title || siteName,
      type: 'secondary',
      url: link,
      publisher: siteName,
      authors: meta?.authors,
      year: meta?.year,
      publicationDate: meta?.publishedDate,
      abstract: meta?.text?.slice(0, 2000),
      summary: meta?.summary,
      venue: siteName ? { name: siteName, type: 'website' } : undefined,
      exa: meta
        ? {
            siteName,
            publishedDate: meta.publishedDate,
            highlights: meta.highlights,
            favicon: meta.favicon,
            image: meta.image,
          }
        : { siteName },
      enrichment: meta ? { status: 'enriched', enrichedAt: Date.now() } : undefined,
    })
  } catch {
    return null
  }
}

/** Resolve pasted links into source records (best-effort, parallel). */
export async function resolveProvidedLinks(raw: string): Promise<SourceRecord[]> {
  const links = parseProvidedLinks(raw)
  if (!links.length) return []
  const settled = await Promise.all(links.map((link, i) => resolveOneLink(link, i)))
  return settled.filter((r): r is SourceRecord => Boolean(r))
}
