/** Unique bibliography number for a source given prior cites in document order. */
export function citationNumberForSource(sourceId: string, priorSourceIds: string[]): number {
  const seen = [...new Set(priorSourceIds)]
  const idx = seen.indexOf(sourceId)
  return idx >= 0 ? idx + 1 : seen.length + 1
}
