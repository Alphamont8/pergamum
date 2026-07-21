/**
 * Extract authors and publication dates from page/PDF plain text when
 * structured metadata (Exa fields, OpenAlex, Crossref) is missing.
 */
import {
  cleanSiteName,
  formatTeamName,
  looksLikePersonName,
  looksLikeTeamName,
  normalizeAuthors,
  normalizePublicationDate,
} from '@/lib/citations/normalize'

export interface ParsedPageMetadata {
  authors?: string
  /** People or a single org literal after normalizeAuthors. */
  authorships?: Array<{ name: string; literal?: boolean }>
  publishedDate?: string
  year?: string
  /** Organization inferred from text (e.g. Centers for Disease Control…). */
  organization?: string
}

const MONTH =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'

const SKIP_LINE_RE =
  /^(abstract|introduction|keywords|contents|table of contents|figure|figures|table|references|bibliography|acknowledg|copyright|all rights|doi:|http|www\.|volume|vol\.|pp\.|page \d)/i

const ORG_LINE_RE =
  /\b(centers for disease control(?: and prevention)?|world health organization|national institutes of health|american academy of sleep medicine|american medical association|food and drug administration|national health service|united nations|world bank)\b/i

function resolvedAuthors(raw?: string | null): {
  authors?: string
  authorships?: Array<{ name: string; literal?: boolean }>
} {
  return normalizeAuthors(raw)
}

function isPlausibleAuthorLine(line: string): boolean {
  if (line.length < 8 || line.length > 240) return false
  if (SKIP_LINE_RE.test(line)) return false
  if (/[.!?]{2,}/.test(line)) return false
  // Titles are often long sentence-case phrases; author lines are denser.
  const words = line.split(/\s+/).filter(Boolean)
  if (words.length > 18) return false
  return true
}

/** "Last, First; Last, First" or "First Last, First Last, and First Last". */
function parsePdfAuthorLine(line: string): {
  authors?: string
  authorships?: Array<{ name: string; literal?: boolean }>
} | undefined {
  if (!isPlausibleAuthorLine(line)) return undefined

  // Semicolon-separated Last, First — keep parts intact (don't rejoin+resplit on commas).
  if (line.includes(';')) {
    const parts = line
      .split(/\s*;\s*/)
      .map((p) => p.trim())
      .filter(Boolean)
    const ok = parts.filter(
      (p) =>
        /^[\p{L}'’.-]+,\s+[A-ZÀ-ÖØ-Þ]/u.test(p) ||
        /^[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3}$/u.test(p),
    )
    if (ok.length >= 2 && ok.length >= Math.ceil(parts.length * 0.6)) {
      return {
        authors: parts.join(', '),
        authorships: parts.map((name) => ({ name, literal: false })),
      }
    }
  }

  const split = (() => {
    const parts = line
      .split(/,\s+(?=[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*,\s+[A-ZÀ-ÖØ-Þ])/u)
      .map((p) => p.trim())
      .filter(Boolean)
    return parts.length >= 2 ? parts : null
  })()
  if (split) {
    return {
      authors: split.join(', '),
      authorships: split.map((name) => ({ name, literal: false })),
    }
  }

  return undefined
}

function parseLabeledAuthors(lines: string[]): string | undefined {
  for (const line of lines) {
    const byMatch = line.match(
      /^(?:#{1,6}\s*)?(?:by|written by|author(?:s)?|prepared by|reporter|analyst)\s*[:-]\s*(.+)$/i,
    )
    if (byMatch?.[1]) {
      const got = resolvedAuthors(byMatch[1])
      if (got.authors) return got.authors
    }
  }
  return undefined
}

function parseInlineByline(head: string): string | undefined {
  const patterns = [
    /\b(?:by|written by)\s+([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3}(?:\s*(?:,|&| and )\s*[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3}){0,5})/u,
    /(?:^|\n)\s*([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){1,3})\s*\n\s*(?:Research|Analyst|Editor|Contributor|Correspondent|Staff Writer)/iu,
  ]
  for (const re of patterns) {
    const m = head.match(re)
    if (!m?.[1]) continue
    const got = resolvedAuthors(m[1])
    if (got.authors) return got.authors
  }
  return undefined
}

function parseOrganization(lines: string[], head: string): string | undefined {
  for (const line of lines.slice(0, 25)) {
    const m = line.match(ORG_LINE_RE)
    if (m?.[1]) return formatTeamName(m[1])
  }
  const m = head.slice(0, 1500).match(ORG_LINE_RE)
  if (m?.[1]) return formatTeamName(m[1])
  return undefined
}

function parseLabeledDate(lines: string[]): { publishedDate?: string; year?: string } {
  for (const line of lines) {
    const labeled = line.match(
      /(?:published|updated|posted|released|date|page\s+last\s+reviewed|last\s+reviewed|last\s+updated|copyright|©)\s*[:-]?\s*(.+)$/i,
    )
    if (!labeled?.[1]) continue
    const n = normalizePublicationDate(labeled[1])
    if (n.publicationDate || n.year) return { publishedDate: n.publicationDate, year: n.year }
  }
  return {}
}

function parseLooseDate(head: string, preferHeadLines: string[]): {
  publishedDate?: string
  year?: string
} {
  // Prefer dates in the first ~15 non-empty lines (cover / byline area).
  const early = preferHeadLines.slice(0, 15).join('\n')
  const scopes = [early, head.slice(0, 2500)]

  for (const scope of scopes) {
    const monthDayYear = scope.match(
      new RegExp(`\\b${MONTH}\\s+\\d{1,2},?\\s+\\d{4}\\b`, 'i'),
    )
    if (monthDayYear) {
      const n = normalizePublicationDate(monthDayYear[0])
      if (n.publicationDate || n.year) return { publishedDate: n.publicationDate, year: n.year }
    }

    const dayMonthYear = scope.match(
      new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\s+\\d{4}\\b`, 'i'),
    )
    if (dayMonthYear) {
      const n = normalizePublicationDate(dayMonthYear[0])
      if (n.publicationDate || n.year) return { publishedDate: n.publicationDate, year: n.year }
    }

    const iso = scope.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/)
    if (iso) {
      const n = normalizePublicationDate(iso[0])
      if (n.publicationDate || n.year) return { publishedDate: n.publicationDate, year: n.year }
    }

    const copyright = scope.match(/(?:©|copyright)\s*(20\d{2}|19\d{2})\b/i)
    if (copyright) return { year: copyright[1] }
  }

  // Last resort: first year in the early cover area only (avoid body years).
  const earlyYear = early.match(/\b(20\d{2}|19\d{2})\b/)
  if (earlyYear) return { year: earlyYear[1] }
  return {}
}

/**
 * Parse authors + dates from extracted article/PDF text.
 * Designed to be conservative: prefer labeled fields and cover-page patterns.
 */
export function parseMetadataFromText(
  text: string,
  options?: { url?: string | null; title?: string | null },
): ParsedPageMetadata {
  if (!text?.trim()) return {}

  const head = text.slice(0, 8000)
  const lines = head
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 100)

  let authors: string | undefined
  let authorships: Array<{ name: string; literal?: boolean }> | undefined

  const labeled = parseLabeledAuthors(lines)
  if (labeled) {
    const bits = resolvedAuthors(labeled)
    authors = bits.authors
    authorships = bits.authorships
  }

  if (!authors) {
    for (const line of lines.slice(0, 30)) {
      const pdf = parsePdfAuthorLine(line)
      if (pdf?.authors) {
        authors = pdf.authors
        authorships = pdf.authorships
        break
      }
    }
  }

  if (!authors) {
    const inline = parseInlineByline(head)
    if (inline) {
      const bits = resolvedAuthors(inline)
      authors = bits.authors
      authorships = bits.authorships
    }
  }

  // Don't treat the article title as an author list.
  if (authors && options?.title) {
    const t = options.title.trim().toLowerCase()
    if (t && authors.toLowerCase().includes(t) && t.length > 20) {
      authors = undefined
      authorships = undefined
    }
  }

  const organization = parseOrganization(lines, head)

  let { publishedDate, year } = parseLabeledDate(lines)
  if (!publishedDate && !year) {
    const loose = parseLooseDate(head, lines)
    publishedDate = loose.publishedDate
    year = loose.year
  }

  if (!authors && organization && looksLikeTeamName(organization)) {
    authors = organization
    authorships = [{ name: organization, literal: true }]
  }

  // Host/org fallback when text has no byline (CDC.gov pages, etc.).
  if (!authors && options?.url) {
    const site = cleanSiteName(undefined, options.url)
    if (site) {
      authors = formatTeamName(site)
      authorships = [{ name: authors, literal: true }]
    }
  }

  if (authors && !authorships?.length) {
    if (looksLikePersonName(authors)) {
      authorships = [{ name: authors, literal: false }]
    } else if (looksLikeTeamName(authors)) {
      authors = formatTeamName(authors)
      authorships = [{ name: authors, literal: true }]
    }
  }

  return {
    authors,
    authorships,
    publishedDate,
    year: year || publishedDate?.slice(0, 4),
    organization,
  }
}
