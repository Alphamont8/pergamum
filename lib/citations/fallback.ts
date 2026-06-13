import type { ReferencingStyleId, SourceRecord } from '@/types'

function firstAuthor(source: SourceRecord): string {
  if (source.authorships?.[0]?.name) return source.authorships[0].name.split(',')[0].trim()
  return source.authors?.split(',')[0]?.trim() ?? 'Unknown'
}

function year(source: SourceRecord): string {
  return source.year ?? source.publicationDate?.slice(0, 4) ?? 'n.d.'
}

export function formatBibliographyFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
): string {
  const author = source.authors ?? firstAuthor(source)
  const y = year(source)
  const title = source.title
  const venue = source.venue?.name ?? source.publisher ?? ''
  const url = source.url ? ` ${source.url}` : ''

  if (styleId === 'mla') {
    return `${author}. "${title}." ${venue ? `${venue}, ` : ''}${y}.${url}`
  }
  if (styleId === 'chicago-notes' || styleId === 'chicago-author-date') {
    return `${author}. ${title}. ${venue ? `${venue}, ` : ''}${y}.${url}`
  }
  if (styleId === 'ieee' || styleId === 'vancouver') {
    return `[n] ${author}, "${title}," ${venue ? `${venue}, ` : ''}${y}.${url}`
  }
  if (styleId === 'bluebook') {
    return `${author}, ${title} (${y})${url ? `, ${source.url}` : ''}.`
  }
  if (styleId === 'harvard') {
    return `${author} (${y}) ${title}.${venue ? ` ${venue}.` : ''}${url}`
  }
  return `${author} (${y}). ${title}.${venue ? ` ${venue}.` : ''}${url}`
}

export function formatInTextFallback(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  citationNumber?: number,
): string {
  const author = firstAuthor(source)
  const y = year(source)

  if (styleId === 'ieee' || styleId === 'vancouver') {
    return `[${citationNumber ?? '?'}]`
  }
  if (styleId === 'chicago-notes') {
    return String(citationNumber ?? '¹')
  }
  if (styleId === 'mla') return `(${author})`
  if (styleId === 'chicago-author-date' || styleId === 'chicago-notes') {
    return `(${author} ${y})`
  }
  if (styleId === 'harvard') return `(${author}, ${y})`
  if (styleId === 'bluebook') return `(${author}, ${y})`
  return `(${author}, ${y})`
}
