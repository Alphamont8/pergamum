import type { ReferencingStyleId, SourceRecord } from '@/types'
import { normalizeSourceForCitation, usesFullDate } from './normalize'

function firstAuthorFamily(source: SourceRecord): string {
  const clean = normalizeSourceForCitation(source)
  const first = clean.authorships?.[0]
  const name = first?.name ?? clean.authors?.split(',')[0]?.trim()
  if (!name) return 'Anonymous'
  // Team/org literals stay whole in parentheticals: (CNN Newsource, 2024)
  if (first?.literal) return name
  if (name.includes(',')) return name.split(',')[0].trim()
  const parts = name.split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || name
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

export function formatBibliographyFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
): string {
  const clean = normalizeSourceForCitation(source)
  const author = clean.authors ?? 'Anonymous'
  const y = yearLabel(clean)
  const fullDate = fullDateLabel(clean)
  const title = clean.title
  const venue = clean.venue?.name ?? ''
  const url = clean.url ? ` ${clean.url}` : ''

  if (styleId === 'mla') {
    return `${author}. "${title}."${venue ? ` ${venue},` : ''} ${y}.${url}`
  }
  const dateForBib = usesFullDate(clean) ? fullDate : y

  if (styleId === 'chicago-notes' || styleId === 'chicago-author-date') {
    return `${author}. "${title}."${venue ? ` ${venue}.` : ''} ${dateForBib}.${url}`
  }
  if (styleId === 'ieee' || styleId === 'vancouver') {
    return `${author}, "${title},"${venue ? ` ${venue},` : ''} ${y}.${url}`
  }
  if (styleId === 'bluebook') {
    return `${author}, ${title} (${y})${clean.url ? `, ${clean.url}` : ''}.`
  }
  if (styleId === 'harvard') {
    return `${author} (${y}) ${title}.${venue ? ` ${venue}.` : ''}${url}`
  }
  // APA: journals → year only; web/news articles → full date when known
  return `${author} (${dateForBib}). ${title}.${venue ? ` ${venue}.` : ''}${url}`
}

export function formatInTextFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  citationNumber?: number,
): string {
  const author = firstAuthorFamily(source)
  const y = yearLabel(source)

  if (styleId === 'ieee' || styleId === 'vancouver' || styleId === 'nature' || styleId === 'science') {
    return `[${citationNumber ?? '?'}]`
  }
  if (styleId === 'chicago-notes' || styleId === 'turabian-notes' || styleId === 'oscola') {
    return String(citationNumber ?? '¹')
  }
  if (styleId === 'mla' || styleId === 'mhra') return `(${author})`
  if (styleId === 'chicago-author-date' || styleId === 'turabian-author-date' || styleId === 'asa') {
    return `(${author} ${y})`
  }
  if (styleId === 'harvard' || styleId === 'acs') return `(${author}, ${y})`
  if (styleId === 'bluebook' || styleId === 'ama') return `(${author}, ${y})`
  return `(${author}, ${y})`
}
