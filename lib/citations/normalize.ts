import type { SourceAuthorship, SourceRecord } from '@/types'

const ORG_AUTHOR_RE =
  /\b(airlines?|airport|international|loyalty|team|staff|editors?|editorial|newsroom|newsource|pr\s*newswire|reuters|associated press|bloomberg|cnn|bbc|wikipedia|inc\.?|llc|ltd|corp\.?|company|group|foundation|institute|university|college|ministry|department|agency|bureau|association|organization|organisation|world\s+bank|united\s+nations|who|unesco|oecd|imf)\b/i

const JUNK_AUTHOR_RE =
  /^(unknown|n\/?a|anonymous|null|undefined|admin|user|guest|home|about|contact)$/i

const PERSON_NAME_RE =
  /^[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,4}$/u

function titleCaseHost(host: string): string {
  const known: Record<string, string> = {
    'wikipedia.org': 'Wikipedia',
    'en.wikipedia.org': 'Wikipedia',
    'simple.wikipedia.org': 'Wikipedia',
    'simpleflying.com': 'Simple Flying',
    'prnewswire.com': 'PR Newswire',
    'atag.org': 'ATAG',
    'abc17news.com': 'ABC17 News',
    'docslib.org': 'DocsLib',
    'nytimes.com': 'The New York Times',
    'bbc.com': 'BBC',
    'bbc.co.uk': 'BBC',
    'theguardian.com': 'The Guardian',
    'reuters.com': 'Reuters',
    'cnn.com': 'CNN',
  }
  const key = host.toLowerCase().replace(/^www\./, '')
  if (known[key]) return known[key]
  const base = key.split('.').slice(0, -1).join('.') || key
  return base
    .split(/[.-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function cleanSiteName(raw?: string | null, url?: string | null): string | undefined {
  let host = (raw ?? '').trim()
  if (!host && url) {
    try {
      host = new URL(url).hostname
    } catch {
      host = ''
    }
  }
  if (!host) return undefined
  host = host.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  if (!host) return undefined
  // Drop duplicated "Foo.Com; foo.com" style values
  if (host.includes(';')) host = host.split(';')[0].trim()
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return titleCaseHost(host)
  return host
    .replace(/\s+/g, ' ')
    .replace(/\.(com|org|net|io|edu|gov)\b/gi, '')
    .trim()
}

export function cleanTitle(title?: string | null, siteName?: string | null): string {
  let t = (title ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return 'Untitled'
  // Strip trailing " - Site" / " | Site" / " — Site"
  if (siteName) {
    const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(new RegExp(`\\s*[|–—:-]\\s*${esc}\\s*$`, 'i'), '').trim()
  }
  t = t.replace(/\s*[|–—-]\s*Wikipedia\s*$/i, '').trim()
  return t || 'Untitled'
}

export function looksLikePersonName(name: string): boolean {
  const n = name.trim()
  if (!n || n.length < 3 || n.length > 80) return false
  if (ORG_AUTHOR_RE.test(n)) return false
  if (JUNK_AUTHOR_RE.test(n)) return false
  if (/\d/.test(n)) return false
  if (/@|\.com|\.org|\.net/i.test(n)) return false
  if (n.split(/\s+/).length > 5) return false
  // Reject all-caps org strings longer than 1 token
  if (n === n.toUpperCase() && n.split(/\s+/).length >= 2) return false
  return PERSON_NAME_RE.test(n) || /^[\p{L}'’.-]+,\s+[\p{L}'’.-]+/u.test(n)
}

export function looksLikeTeamName(name: string): boolean {
  const n = name.trim()
  if (!n || n.length < 2 || n.length > 120) return false
  if (JUNK_AUTHOR_RE.test(n)) return false
  if (/^https?:\/\//i.test(n)) return false
  if (/@/.test(n)) return false
  // Domains alone are venues, not authors
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(n)) return false
  if (looksLikePersonName(n)) return false
  // Prefer clear org/team signals, multi-word titles, or known acronyms
  if (ORG_AUTHOR_RE.test(n)) return true
  if (/^[A-Z]{2,8}$/.test(n)) return true
  if (n.split(/\s+/).length >= 2) return true
  return n.length >= 3
}

/** Format organization/team names as clean literals (Title Case, no domain fluff). */
export function formatTeamName(raw: string): string {
  let n = raw.replace(/\s+/g, ' ').trim()
  n = n.replace(/^(by|written by|author[:\s]+|authors[:\s]+)/i, '').trim()
  n = n.replace(/\s*[|\-–—]\s*.*$/, '').trim()
  // Drop trailing Inc/LLC noise only when redundant; keep core name
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(n)) return titleCaseHost(n)

  // Preserve known all-caps acronyms; otherwise title-case words
  const words = n.split(/\s+/).filter(Boolean)
  return words
    .map((w) => {
      if (/^[A-Z0-9]{2,8}$/.test(w)) return w
      if (/^(and|of|the|for|in|on|at)$/i.test(w) && words.length > 2) {
        return w.toLowerCase()
      }
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bThe\b/g, 'The')
}

export function splitAuthorList(raw?: string | null): string[] {
  if (!raw) return []
  return raw
    .split(/\s*(?:,|;|&|\/|\band\b|\bAND\b)\s*/)
    .map((a) => a.replace(/^(by|written by|author[:\s]+)/i, '').trim())
    .filter(Boolean)
}

export function normalizeAuthors(raw?: string | null): {
  authors?: string
  authorships?: SourceAuthorship[]
} {
  const parts = splitAuthorList(raw)
  const people = parts.filter(looksLikePersonName)
  if (people.length) {
    return {
      authors: people.join(', '),
      authorships: people.map((name) => ({ name, literal: false })),
    }
  }

  // Only fall back to a team/org when no individual authors exist.
  const teams = parts.map(formatTeamName).filter(looksLikeTeamName)
  if (!teams.length && raw?.trim() && looksLikeTeamName(formatTeamName(raw))) {
    teams.push(formatTeamName(raw))
  }
  if (!teams.length) return {}

  // Prefer a single team literal (don't invent multi-org author lists from junk splits)
  const team = teams[0]
  return {
    authors: team,
    authorships: [{ name: team, literal: true }],
  }
}

export function normalizePublicationDate(
  publicationDate?: string | null,
  year?: string | null,
): { publicationDate?: string; year?: string; dateParts?: number[] } {
  const raw = (publicationDate ?? year ?? '').trim()
  if (!raw) return {}

  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const m = parseInt(iso[2], 10)
    const d = parseInt(iso[3], 10)
    return {
      publicationDate: `${iso[1]}-${iso[2]}-${iso[3]}`,
      year: iso[1],
      dateParts: [y, m, d],
    }
  }

  const parsed = Date.parse(raw)
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed)
    const y = dt.getUTCFullYear()
    const m = dt.getUTCMonth() + 1
    const d = dt.getUTCDate()
    return {
      publicationDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      year: String(y),
      dateParts: [y, m, d],
    }
  }

  const yOnly = raw.match(/\b((?:19|20)\d{2})\b/)
  if (yOnly) return { year: yOnly[1], dateParts: [parseInt(yOnly[1], 10)] }
  return {}
}

/**
 * Rigid cleanup before CSL / bibliography formatting.
 * Prefer individual authors; use a formatted team/org literal only when none exist.
 */
export function normalizeSourceForCitation(source: SourceRecord): SourceRecord {
  const siteName = cleanSiteName(source.venue?.name ?? source.publisher ?? source.exa?.siteName, source.url)

  const fromAuthorshipPeople = (source.authorships ?? [])
    .map((a) => a.name)
    .filter(looksLikePersonName)
  const authorBits = fromAuthorshipPeople.length
    ? {
        authors: fromAuthorshipPeople.join(', '),
        authorships: fromAuthorshipPeople.map((name) => ({ name, literal: false })),
      }
    : normalizeAuthors(source.authors)

  // If authorships were org-only, allow a single formatted team literal
  let authorships = authorBits.authorships
  let authors = authorBits.authors
  if (!authors) {
    const orgFromAuthorships = (source.authorships ?? [])
      .map((a) => formatTeamName(a.name))
      .filter(looksLikeTeamName)
    if (orgFromAuthorships.length) {
      const team = orgFromAuthorships[0]
      authors = team
      authorships = [{ name: team, literal: true }]
    }
  }

  const dateBits = normalizePublicationDate(source.publicationDate, source.year)
  const title = cleanTitle(source.title, siteName)

  return {
    ...source,
    title,
    authors,
    authorships,
    year: dateBits.year ?? source.year,
    publicationDate: dateBits.publicationDate ?? source.publicationDate,
    publisher: siteName ?? source.publisher,
    venue: siteName
      ? {
          name: siteName,
          type: source.venue?.type ?? (source.sourceKind === 'webpage' ? 'website' : source.venue?.type),
          publisher: source.venue?.publisher,
          issn: source.venue?.issn,
        }
      : source.venue,
    exa: source.exa
      ? {
          ...source.exa,
          siteName: siteName ?? source.exa.siteName,
          publishedDate: dateBits.publicationDate ?? source.exa.publishedDate,
        }
      : source.exa,
  }
}

/** Journals/books: year only. Web articles/reports/cases: full date when available. */
export function usesFullDate(source: SourceRecord): boolean {
  const kind = source.sourceKind
  if (kind === 'journal-article' || kind === 'book' || kind === 'book-chapter' || kind === 'thesis') {
    return false
  }
  if (
    kind === 'webpage' ||
    kind === 'report' ||
    kind === 'preprint' ||
    kind === 'legal-case' ||
    kind === 'other'
  ) {
    return true
  }
  // Infer from URL / missing academic venue
  if (source.url && !source.doi) return true
  return Boolean(source.url) && !source.biblio?.volume
}

export function getDateParts(source: SourceRecord): number[] | undefined {
  const parts = normalizePublicationDate(source.publicationDate, source.year).dateParts
  if (!parts?.length) return undefined
  if (usesFullDate(source)) return parts
  return [parts[0]]
}
