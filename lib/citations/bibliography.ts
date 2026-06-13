import type {
  BibliographyEntry,
  BibliographyGroup,
  CitationInstance,
  OutlineNode,
  ReferencingStyleId,
  SourceRecord,
} from '@/types'
import { isNumericReferencingStyle } from '@/utils/referencingStyle'
import { extractCitationSpansFromDraft } from './reconcile'

export interface BibliographyHygieneWarning {
  id: string
  type: 'missing-author' | 'missing-year' | 'orphan-citation' | 'duplicate'
  message: string
  sourceIds?: string[]
}

export function getOutlineSourceIds(nodes: OutlineNode[]): Set<string> {
  const ids = new Set<string>()
  for (const node of nodes) {
    for (const ref of node.sourceRefs) {
      ids.add(ref.sourceId)
    }
  }
  return ids
}

export function getCitedSourceIdsFromDraft(
  sections: Array<{ id: string; html: string; content: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const section of sections) {
    const spans = extractCitationSpansFromDraft(section.html, section.content)
    for (const span of spans) {
      const list = map.get(span.sourceId) ?? []
      list.push(span.citationId)
      map.set(span.sourceId, list)
    }
  }
  return map
}

export function classifySources(
  sources: SourceRecord[],
  outlineNodes: OutlineNode[],
  draftSections: Array<{ id: string; html: string; content: string }>,
): Map<string, BibliographyGroup> {
  const cited = getCitedSourceIdsFromDraft(draftSections)
  const outlineIds = getOutlineSourceIds(outlineNodes)
  const groups = new Map<string, BibliographyGroup>()

  for (const source of sources) {
    if (cited.has(source.id)) {
      groups.set(source.id, 'cited')
    } else if (outlineIds.has(source.id)) {
      groups.set(source.id, 'outline')
    } else {
      groups.set(source.id, 'unused')
    }
  }
  return groups
}

export function orderBibliographyIds(
  styleId: ReferencingStyleId,
  sources: SourceRecord[],
  groups: Map<string, BibliographyGroup>,
  draftSections: Array<{ id: string; html: string; content: string }>,
  citations: CitationInstance[],
): string[] {
  const citedIds = [...groups.entries()]
    .filter(([, g]) => g === 'cited')
    .map(([id]) => id)

  if (isNumericReferencingStyle(styleId)) {
    const appearanceOrder: string[] = []
    const seen = new Set<string>()
    for (const section of draftSections) {
      const spans = extractCitationSpansFromDraft(section.html, section.content)
      for (const span of spans) {
        if (!seen.has(span.sourceId)) {
          seen.add(span.sourceId)
          appearanceOrder.push(span.sourceId)
        }
      }
    }
    for (const c of citations) {
      if (!seen.has(c.sourceId)) {
        seen.add(c.sourceId)
        appearanceOrder.push(c.sourceId)
      }
    }
    return appearanceOrder
  }

  const sortAlpha = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const sa = sources.find((s) => s.id === a)
      const sb = sources.find((s) => s.id === b)
      const aa = sa?.authors ?? sa?.title ?? ''
      const ab = sb?.authors ?? sb?.title ?? ''
      return aa.localeCompare(ab)
    })

  const cited = sortAlpha(citedIds)
  const outline = sortAlpha(
    [...groups.entries()].filter(([, g]) => g === 'outline').map(([id]) => id),
  )
  const unused = sortAlpha(
    [...groups.entries()].filter(([, g]) => g === 'unused').map(([id]) => id),
  )

  return [...cited, ...outline, ...unused]
}

export function buildBibliographyHygieneWarnings(
  sources: SourceRecord[],
  draftSections: Array<{ id: string; html: string; content: string }>,
): BibliographyHygieneWarning[] {
  const warnings: BibliographyHygieneWarning[] = []

  for (const source of sources) {
    if (!source.authors && !source.authorships?.length) {
      warnings.push({
        id: `warn-author-${source.id}`,
        type: 'missing-author',
        message: `"${source.title}" is missing author information.`,
        sourceIds: [source.id],
      })
    }
    if (!source.year && !source.publicationDate) {
      warnings.push({
        id: `warn-year-${source.id}`,
        type: 'missing-year',
        message: `"${source.title}" has no publication year.`,
        sourceIds: [source.id],
      })
    }
  }

  const knownIds = new Set(sources.map((s) => s.id))
  for (const section of draftSections) {
    const spans = extractCitationSpansFromDraft(section.html, section.content)
    for (const span of spans) {
      if (!knownIds.has(span.sourceId)) {
        warnings.push({
          id: `warn-orphan-${span.citationId}`,
          type: 'orphan-citation',
          message: `A citation references a missing source (${span.sourceId}).`,
          sourceIds: [span.sourceId],
        })
      }
    }
  }

  const byDoi = new Map<string, string[]>()
  const byUrl = new Map<string, string[]>()
  for (const s of sources) {
    if (s.doi) {
      const list = byDoi.get(s.doi) ?? []
      list.push(s.id)
      byDoi.set(s.doi, list)
    }
    if (s.url) {
      const list = byUrl.get(s.url) ?? []
      list.push(s.id)
      byUrl.set(s.url, list)
    }
  }

  for (const [, ids] of [...byDoi.entries(), ...byUrl.entries()]) {
    if (ids.length > 1) {
      warnings.push({
        id: `warn-dup-${ids.join('-')}`,
        type: 'duplicate',
        message: `${ids.length} sources appear to be duplicates.`,
        sourceIds: ids,
      })
    }
  }

  return warnings
}

export function buildBibliographyEntries(
  sources: SourceRecord[],
  formatted: Map<string, string>,
  groups: Map<string, BibliographyGroup>,
  draftSections: Array<{ id: string; html: string; content: string }>,
  orderedIds: string[],
): BibliographyEntry[] {
  const citedMap = getCitedSourceIdsFromDraft(draftSections)
  const numberMap = new Map<string, number>()
  let num = 1
  for (const id of orderedIds) {
    if (groups.get(id) === 'cited') {
      numberMap.set(id, num++)
    }
  }

  return orderedIds
    .filter((id) => sources.some((s) => s.id === id))
    .map((sourceId) => {
      const citationIds = citedMap.get(sourceId) ?? []
      return {
        sourceId,
        group: groups.get(sourceId) ?? 'unused',
        formatted: formatted.get(sourceId) ?? sources.find((s) => s.id === sourceId)?.title ?? '',
        citationIds,
        citationCount: citationIds.length,
        citationNumber: numberMap.get(sourceId),
      }
    })
}

export function computeAverageReliability(sources: SourceRecord[]): number | null {
  const scored = sources.filter((s) => s.reliability?.overall != null)
  if (scored.length === 0) return null
  const sum = scored.reduce((n, s) => n + (s.reliability?.overall ?? 0), 0)
  return Math.round(sum / scored.length)
}

export function countLowReliabilityCited(
  sources: SourceRecord[],
  citedIds: Set<string>,
  threshold = 50,
): number {
  return sources.filter(
    (s) => citedIds.has(s.id) && (s.reliability?.overall ?? 100) < threshold,
  ).length
}
