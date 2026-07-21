import type { ReferencingStyleId, SourceRecord } from '@/types'
import {
  isBracketNumericReferencingStyle,
  isScienceParentheticalStyle,
  isSuperscriptReferencingStyle,
  normalizeReferencingStyleId,
} from '@/utils/referencingStyle'
import { normalizeSourceForCitation, usesFullDate, splitAuthorList } from './normalize'

function firstAuthorFamily(source: SourceRecord): string {
  const clean = normalizeSourceForCitation(source)
  const first = clean.authorships?.[0]
  const name = first?.name ?? clean.authors?.split(',')[0]?.trim()
  if (!name) return shortenedTitle(clean.title)
  if (first?.literal) return name
  if (name.includes(',')) return name.split(',')[0].trim()
  const parts = name.split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || name
}

/** APA/MLA-style short title when no author is available. */
function shortenedTitle(title?: string): string {
  const t = (title ?? 'Untitled').replace(/\s+/g, ' ').trim()
  const words = t.split(/\s+/).slice(0, 4).join(' ')
  return words.length > 40 ? `${words.slice(0, 37).trim()}…` : words
}

function hasRealAuthor(source: SourceRecord): boolean {
  const clean = normalizeSourceForCitation(source)
  return Boolean(clean.authors?.trim())
}

/** Vancouver / AMA / NLM-style "Surname AB, Surname CD". */
function authorsInitialsList(source: SourceRecord, max = 6): string {
  const clean = normalizeSourceForCitation(source)
  if (!clean.authors?.trim() && !clean.authorships?.length) {
    return shortenedTitle(clean.title)
  }

  let people = clean.authorships?.length ? [...clean.authorships] : []
  if (!people.length && clean.authors) {
    people = splitAuthorList(clean.authors).map((name) => ({ name, literal: false }))
  }

  const formatted = people.slice(0, max).map((a) => {
    if (a.literal) return a.name
    const name = a.name.trim()
    if (name.includes(',')) {
      const [family, ...rest] = name.split(',')
      const given = rest.join(',').trim()
      const initials = given
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p.replace(/\./g, '')[0]?.toUpperCase() ?? '')
        .join('')
      return initials ? `${family.trim()} ${initials}` : family.trim()
    }
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0]
    const family = parts[parts.length - 1]
    const initials = parts
      .slice(0, -1)
      .map((p) => p.replace(/\./g, '')[0]?.toUpperCase() ?? '')
      .join('')
    return `${family} ${initials}`
  })

  if (people.length > max) return `${formatted.join(', ')}, et al.`
  return formatted.join(', ') || shortenedTitle(clean.title)
}

function yearLabel(source: SourceRecord): string {
  const clean = normalizeSourceForCitation(source)
  return clean.year ?? clean.publicationDate?.slice(0, 4) ?? 'n.d.'
}

function fullDateLabel(source: SourceRecord): string {
  const clean = normalizeSourceForCitation(source)
  if (clean.publicationDate && /^\d{4}-\d{2}-\d{2}$/.test(clean.publicationDate)) {
    const [y, m, d] = clean.publicationDate.split('-').map(Number)
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    return `${y}, ${months[m - 1]} ${d}`
  }
  return yearLabel(clean)
}

function doiOrUrl(clean: SourceRecord): string {
  if (clean.doi) {
    const doi = clean.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    return ` https://doi.org/${doi}`
  }
  return clean.url ? ` ${clean.url}` : ''
}

/** Avoid `n.d..` / double terminal punctuation. */
function endSentence(parts: string[]): string {
  const joined = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\.{2,}/g, '.')
    .trim()
  if (!joined) return ''
  return /[.!?]$/.test(joined) ? joined : `${joined}.`
}

function venueIfDistinct(clean: SourceRecord, author: string): string {
  const venue = clean.venue?.name?.trim() ?? ''
  if (!venue) return ''
  if (venue.toLowerCase() === author.toLowerCase()) return ''
  if (clean.publisher && venue.toLowerCase() === clean.publisher.toLowerCase() && author.toLowerCase() === clean.publisher.toLowerCase()) {
    return ''
  }
  return venue
}

export function toSuperscriptNumber(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  }
  return String(n)
    .split('')
    .map((d) => map[d] ?? d)
    .join('')
}

export function formatBibliographyFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
): string {
  const id = normalizeReferencingStyleId(styleId)
  const clean = normalizeSourceForCitation(source)
  const author = clean.authors?.trim() || shortenedTitle(clean.title)
  const y = yearLabel(clean)
  const fullDate = fullDateLabel(clean)
  const title = clean.title
  const venue = venueIfDistinct(clean, author)
  const pages = clean.biblio?.pages
  const volume = clean.biblio?.volume
  const issue = clean.biblio?.issue
  const volIssue =
    volume && issue ? `${volume}(${issue})` : volume ? String(volume) : issue ? `(${issue})` : ''
  const pageBit = pages ? `:${pages}` : ''
  const dateForBib = usesFullDate(clean) ? fullDate : y
  const link = doiOrUrl(clean)

  if (id === 'mla') {
    return endSentence([
      `${author}. "${title}."`,
      venue ? `${venue},` : '',
      `${y}`,
      link.trim(),
    ])
  }

  if (
    id === 'chicago-notes' ||
    id === 'chicago-author-date' ||
    id === 'turabian-notes' ||
    id === 'turabian-author-date'
  ) {
    return endSentence([
      `${author}. "${title}."`,
      venue ? `${venue}.` : '',
      dateForBib,
      link.trim(),
    ])
  }

  if (id === 'ieee') {
    return endSentence([
      `${author}, "${title},"`,
      venue ? `${venue},` : '',
      y,
      link.trim(),
    ])
  }

  if (id === 'vancouver') {
    const authors = authorsInitialsList(clean, 6)
    const journal = venue || (clean.publisher && clean.publisher.toLowerCase() !== author.toLowerCase()
      ? clean.publisher
      : '') || 'Online'
    return endSentence([
      `${authors}. ${title}. ${journal}. ${y}${volIssue ? `;${volIssue}` : ''}${pageBit}.`,
      link.trim(),
    ])
  }

  if (id === 'ama') {
    const authors = authorsInitialsList(clean, 3)
    const journal = venue || (clean.publisher && clean.publisher.toLowerCase() !== author.toLowerCase()
      ? clean.publisher
      : '') || 'Online'
    const doi = clean.doi
      ? `doi:${clean.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')}`
      : clean.url || ''
    return endSentence([
      `${authors}. ${title}. ${journal}. ${y}${volIssue ? `;${volIssue}` : ''}${pageBit}.`,
      doi,
    ])
  }

  if (id === 'acs') {
    const authors = authorsInitialsList(clean, 10)
    const journal =
      venue ||
      (clean.publisher && clean.publisher.toLowerCase() !== author.toLowerCase()
        ? clean.publisher
        : '') ||
      'Online'
    const bits = [`${authors}. ${title}. ${journal}`, y, volume || undefined, pages || undefined]
      .filter(Boolean)
      .join(', ')
    return endSentence([bits, link.trim()])
  }

  if (id === 'nature' || id === 'science') {
    const authors = authorsInitialsList(clean, 5)
    const journal =
      venue ||
      (clean.publisher && clean.publisher.toLowerCase() !== author.toLowerCase()
        ? clean.publisher
        : '') ||
      'Online'
    const loc = [volume, pages].filter(Boolean).join(', ')
    return endSentence([`${authors}. ${title}. ${journal}`, loc, `(${y})`, link.trim()])
  }

  if (id === 'asa') {
    return endSentence([
      `${author}. ${y}. "${title}."`,
      venue ? `${venue}.` : '',
      link.trim(),
    ])
  }

  if (id === 'mhra') {
    return endSentence([
      `${author}, '${title}'`,
      venue ? `, ${venue}` : '',
      `(${y})`,
      link.trim(),
    ])
  }

  if (id === 'oscola') {
    return endSentence([
      `${author}, '${title}'`,
      venue ? `(${venue}, ${y})` : `(${y})`,
      link.trim(),
    ])
  }

  if (id === 'bluebook') {
    if (clean.sourceKind === 'legal-case') {
      return endSentence([title, venue || y, clean.url || ''])
    }
    return endSentence([`${author}, ${title} (${y})`, clean.url || ''])
  }

  if (id === 'harvard') {
    return endSentence([
      `${author} (${y}) ${title}.`,
      venue ? `${venue}.` : '',
      link.trim(),
    ])
  }

  // APA
  return endSentence([
    `${author} (${dateForBib}). ${title}.`,
    venue ? `${venue}.` : '',
    link.trim(),
  ])
}

export function formatInTextFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  citationNumber?: number,
): string {
  const id = normalizeReferencingStyleId(styleId)
  const clean = normalizeSourceForCitation(source)
  const y = yearLabel(clean)
  const n = citationNumber ?? 1
  const author = firstAuthorFamily(clean)
  const titled = !hasRealAuthor(clean)

  if (isBracketNumericReferencingStyle(id)) {
    return `[${n}]`
  }
  if (isScienceParentheticalStyle(id)) {
    return `(${n})`
  }
  if (isSuperscriptReferencingStyle(id)) {
    return toSuperscriptNumber(n)
  }
  if (id === 'mla') {
    // MLA: author, or short title in quotes when no author.
    return titled ? `("${author}")` : `(${author})`
  }
  if (id === 'chicago-author-date' || id === 'turabian-author-date' || id === 'asa') {
    return titled ? `("${author}" ${y})` : `(${author} ${y})`
  }
  if (id === 'harvard') {
    return titled ? `('${author}', ${y})` : `(${author}, ${y})`
  }
  // APA: (Author, Year) or (Short Title, Year)
  return titled ? `("${author}", ${y})` : `(${author}, ${y})`
}
