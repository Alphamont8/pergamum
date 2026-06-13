import type { OutlineSourceRef } from '../types'

/** Resolved quote lines for display/edit (migrates legacy single `quote` field). */
export function getSourceRefQuotes(ref: OutlineSourceRef): string[] {
  if (ref.quotes?.length) return ref.quotes
  if (ref.quote?.trim()) return [ref.quote]
  return []
}

export function normalizeSourceRefQuotes(ref: OutlineSourceRef): OutlineSourceRef {
  const quotes = getSourceRefQuotes(ref).filter((q) => q.trim())
  if (quotes.length === 0) {
    return { sourceId: ref.sourceId }
  }
  return {
    sourceId: ref.sourceId,
    quotes,
    quote: quotes.join('\n\n'),
  }
}
