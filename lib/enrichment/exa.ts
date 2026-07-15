import type { SourceRecord } from '@/types'
import {
  normalizeAuthors,
  normalizePublicationDate,
  cleanSiteName,
  cleanTitle,
} from '@/lib/citations/normalize'

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
  publishedDate?: string
  year?: string
  title?: string
  siteName?: string
  summary?: string
  text?: string
  highlights?: string[]
  favicon?: string
  image?: string
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

/** Prefer individual authors; allow a formatted team name only as fallback. */
function resolvedAuthors(raw?: string | null): string | undefined {
  return normalizeAuthors(raw).authors
}

/** Pull author/date from page markdown when Exa metadata fields are empty. */
export function parseMetadataFromText(text: string): Pick<PageMetadata, 'authors' | 'publishedDate' | 'year'> {
  if (!text) return {}
  const head = text.slice(0, 3500)
  const lines = head
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 60)

  let authors: string | undefined
  let publishedDate: string | undefined
  let year: string | undefined

  for (const line of lines) {
    if (!authors) {
      const byMatch = line.match(
        /^(?:#{1,6}\s*)?(?:by|written by|author|authors|reporter|analyst)\s*[:-]?\s*(.+)$/i,
      )
      if (byMatch) authors = resolvedAuthors(byMatch[1])
    }
    if (!publishedDate && !year) {
      const dateLabel = line.match(/(?:published|updated|posted|date)\s*[:-]?\s*(.+)$/i)
      if (dateLabel) {
        const n = normalizePublicationDate(dateLabel[1])
        publishedDate = n.publicationDate
        year = n.year
      }
    }
  }

  if (!authors) {
    // Prefer explicit bylines (Statista, news sites, blogs).
    const patterns = [
      /\b(?:by|written by|author[:\s]+)\s*([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3})(?:\s*(?:,|&| and )\s*[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3}){0,4}/u,
      /\*\*\s*([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3})\s*\*\*/u,
      /(?:^|\n)\s*([A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){1,3})\s*\n\s*(?:Research|Analyst|Editor|Contributor|Statista)/iu,
    ]
    for (const re of patterns) {
      const m = head.match(re)
      if (!m) continue
      const candidate = resolvedAuthors(m[1] ?? m[0].replace(/^(by|written by|author[:\s]+)/i, ''))
      if (candidate) {
        authors = candidate
        break
      }
    }
  }

  if (!publishedDate && !year) {
    const monthDate = head.match(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/i,
    )
    if (monthDate) {
      const n = normalizePublicationDate(monthDate[0])
      publishedDate = n.publicationDate
      year = n.year
    }
  }

  if (!year) {
    const y = head.match(/\b(20\d{2}|19\d{2})\b/)
    if (y) year = y[1]
  }

  return { authors, publishedDate, year }
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
    const authors = resolvedAuthors(rawAuthors)
    const dateBits = normalizePublicationDate(
      parsed.publishedDate ?? undefined,
      parsed.year != null ? String(parsed.year) : undefined,
    )
    return {
      authors,
      publishedDate: dateBits.publicationDate,
      year: dateBits.year,
      siteName: cleanSiteName(parsed.siteName),
    }
  } catch {
    return {}
  }
}

/**
 * Live-fetch a URL via Exa Contents and recover author/date/title/text.
 * Uses text + highlights only (no AI summary) to keep contents cost down.
 * Prefer maxAgeHours=24 when the caller already has a usable snippet; use 0 for thin pages.
 */
export async function fetchPageMetadata(
  url: string,
  options?: { maxAgeHours?: number },
): Promise<PageMetadata | null> {
  if (!url) return null

  const maxAgeHours = options?.maxAgeHours ?? 0

  const data = await exaFetch<{ results?: ExaContentsResult[] }>('/contents', {
    urls: [url],
    text: { maxCharacters: 4000 },
    highlights: { numSentences: 3, highlightsPerUrl: 3 },
    maxAgeHours,
  })

  const result = data?.results?.[0]
  if (!result) return null

  let host: string | undefined
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    host = undefined
  }

  const fromFields = {
    authors: resolvedAuthors(result.author),
    ...normalizePublicationDate(result.publishedDate),
  }
  const fromSummary = parseStructuredSummary(result.summary)
  const fromText = parseMetadataFromText(result.text ?? '')

  // Prefer page-text bylines, then structured summary (if present), then Exa author field.
  const authors = fromText.authors || fromSummary.authors || fromFields.authors
  const publishedDate =
    fromFields.publicationDate || fromSummary.publishedDate || fromText.publishedDate
  const year =
    fromFields.year || fromSummary.year || fromText.year || publishedDate?.slice(0, 4)
  const siteName = cleanSiteName(fromSummary.siteName || host, url)

  return {
    title: cleanTitle(result.title, siteName),
    authors,
    publishedDate,
    year,
    siteName,
    summary: result.text?.slice(0, 800),
    text: result.text,
    highlights: result.highlights,
    favicon: result.favicon,
    image: result.image,
  }
}

export async function enrichFromExa(source: SourceRecord): Promise<Partial<SourceRecord>> {
  if (!source.url) return {}
  const meta = await fetchPageMetadata(source.url)
  if (!meta) return {}

  const authorBits = normalizeAuthors(meta.authors) 
  const fallbackBits = !authorBits.authors ? normalizeAuthors(source.authors) : null
  const authors = authorBits.authors || fallbackBits?.authors
  const authorships = authorBits.authorships || fallbackBits?.authorships
  const dateBits = normalizePublicationDate(
    meta.publishedDate || source.publicationDate,
    meta.year || source.year,
  )
  const siteName = cleanSiteName(meta.siteName || source.publisher || source.exa?.siteName, source.url)
  const title = cleanTitle(meta.title || source.title, siteName)

  const patch: Partial<SourceRecord> = {
    title,
    authors,
    authorships,
    year: dateBits.year,
    publicationDate: dateBits.publicationDate,
    publisher: siteName,
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

  return patch
}
