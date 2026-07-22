import type { SourceRecord } from '@/types'
import {
  normalizeAuthors,
  normalizePublicationDate,
  cleanSiteName,
  cleanTitle,
  encyclopediaOrgAuthor,
  formatTeamName,
  isEncyclopediaUrl,
} from '@/lib/citations/normalize'
import { parseMetadataFromText } from '@/lib/enrichment/parsePageMetadata'
import {
  fetchPdfMetadataWithLlama,
  isPdfUrl,
  mergePdfMetadata,
  needsLlamaPdfFallback,
} from '@/lib/enrichment/llamaParse'

export interface ExaContentsResult {
  title?: string
  url?: string
  author?: string
  publishedDate?: string
  text?: string
  highlights?: string[]
  summary?: string
  favicon?: string
  image?: string
}

export interface PageMetadata {
  authors?: string
  authorships?: Array<{ name: string; literal?: boolean }>
  publishedDate?: string
  year?: string
  title?: string
  siteName?: string
  summary?: string
  text?: string
  highlights?: string[]
  favicon?: string
  image?: string
  organization?: string
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

  if (!res.ok) {
    console.warn('[exa] request failed', path, res.status)
    return null
  }
  return res.json() as Promise<T>
}

function resolvedAuthors(raw?: string | null): string | undefined {
  return normalizeAuthors(raw).authors
}

function parseStructuredSummary(summary?: string): Partial<PageMetadata> {
  if (!summary) return {}
  try {
    const parsed = JSON.parse(summary) as {
      authors?: string | string[] | null
      publishedDate?: string | null
      year?: string | number | null
      siteName?: string | null
    }
    const rawAuthors = Array.isArray(parsed.authors)
      ? parsed.authors.filter(Boolean).join(', ')
      : (parsed.authors ?? undefined)
    const bits = normalizeAuthors(rawAuthors)
    const dateBits = normalizePublicationDate(
      parsed.publishedDate ?? undefined,
      parsed.year != null ? String(parsed.year) : undefined,
    )
    return {
      authors: bits.authors,
      authorships: bits.authorships,
      publishedDate: dateBits.publicationDate,
      year: dateBits.year,
      siteName: cleanSiteName(parsed.siteName),
    }
  } catch {
    return {}
  }
}

/** Re-export for tests / callers that imported from exa. */
export { parseMetadataFromText }

/**
 * Live-fetch a URL via Exa Contents and recover author/date/title/text.
 * Pulls a longer text window so PDF cover pages and CDC-style stamps are visible.
 * For PDFs, falls back to LlamaParse + LlamaExtract when Exa leaves authors/dates thin.
 */
export async function fetchPageMetadata(
  url: string,
  options?: { maxAgeHours?: number; maxCharacters?: number },
): Promise<PageMetadata | null> {
  if (!url) return null

  const maxAgeHours = options?.maxAgeHours ?? 0
  const maxCharacters = options?.maxCharacters ?? 8000
  const looksPdf = isPdfUrl(url)

  const data = await exaFetch<{ results?: ExaContentsResult[] }>('/contents', {
    urls: [url],
    text: { maxCharacters: looksPdf ? Math.max(maxCharacters, 10000) : maxCharacters },
    highlights: { numSentences: 4, highlightsPerUrl: 4 },
    maxAgeHours,
  })

  const result = data?.results?.[0]
  let meta: PageMetadata | null = null

  if (result) {
    let host: string | undefined
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      host = undefined
    }

    const fromFieldsBits = normalizeAuthors(result.author)
    const fromFields = {
      authors: fromFieldsBits.authors,
      authorships: fromFieldsBits.authorships,
      ...normalizePublicationDate(result.publishedDate),
    }
    const fromSummary = parseStructuredSummary(result.summary)
    const fromText = parseMetadataFromText(result.text ?? '', {
      url,
      title: result.title,
    })

    // Prefer page-text bylines, then Exa author field, then structured summary.
    const authors = fromText.authors || fromFields.authors || fromSummary.authors
    const authorships = fromText.authorships || fromFields.authorships || fromSummary.authorships
    const publishedDate =
      fromFields.publicationDate || fromSummary.publishedDate || fromText.publishedDate
    const year =
      fromFields.year || fromSummary.year || fromText.year || publishedDate?.slice(0, 4)
    const siteName = cleanSiteName(
      fromSummary.siteName || fromText.organization || host,
      url,
    )

    const encyclopedia = isEncyclopediaUrl(url) ? encyclopediaOrgAuthor(url) : null

    meta = {
      title: cleanTitle(result.title, siteName),
      authors: encyclopedia?.authors ?? authors,
      authorships: encyclopedia?.authorships ?? authorships,
      publishedDate,
      year,
      siteName,
      organization: encyclopedia?.authors ?? fromText.organization,
      summary: result.text?.slice(0, 800),
      text: result.text,
      highlights: result.highlights,
      favicon: result.favicon,
      image: result.image,
    }
  }

  if (looksPdf && needsLlamaPdfFallback(meta, url)) {
    try {
      const llama = await fetchPdfMetadataWithLlama(url)
      if (llama) {
        meta = mergePdfMetadata(meta, llama, url)
      }
    } catch (err) {
      console.warn(
        '[exa] Llama PDF fallback failed',
        url,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return meta
}

export async function enrichFromExa(source: SourceRecord): Promise<Partial<SourceRecord>> {
  if (!source.url) return {}
  const meta = await fetchPageMetadata(source.url)
  if (!meta) return {}

  const encyclopedia = encyclopediaOrgAuthor(source.url)
  const metaBits = encyclopedia
    ? encyclopedia
    : meta.authors
      ? normalizeAuthors(meta.authors)
      : { authors: undefined, authorships: meta.authorships }
  const existingBits = !metaBits.authors ? normalizeAuthors(source.authors) : null
  const authors = metaBits.authors || existingBits?.authors
  const authorships = metaBits.authorships || existingBits?.authorships || meta.authorships
  const dateBits = normalizePublicationDate(
    meta.publishedDate || source.publicationDate,
    meta.year || source.year,
  )
  const siteName = cleanSiteName(
    meta.siteName || meta.organization || source.publisher || source.exa?.siteName,
    source.url,
  )
  const title = cleanTitle(meta.title || source.title, siteName)

  return {
    title,
    authors,
    authorships,
    year: dateBits.year,
    publicationDate: dateBits.publicationDate,
    publisher: siteName ? formatTeamName(siteName) : source.publisher,
    venue: siteName
      ? { name: siteName, type: 'website', publisher: source.venue?.publisher }
      : source.venue,
    summary: meta.summary || source.summary,
    abstract: meta.text?.slice(0, 2000) || source.abstract,
    exa: {
      favicon: meta.favicon,
      image: meta.image,
      siteName,
      publishedDate: dateBits.publicationDate,
      highlights: meta.highlights,
    },
    enrichment: { status: 'enriched', enrichedAt: Date.now() },
  }
}
