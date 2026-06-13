'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  BibliographyEntry,
  CitationInstance,
  OutlineNode,
  ReferencingStyleId,
  SourceRecord,
} from '@/types'
import {
  buildBibliographyEntries,
  buildBibliographyHygieneWarnings,
  classifySources,
  computeAverageReliability,
  countLowReliabilityCited,
  formatBibliographyBatch,
  orderBibliographyIds,
  type BibliographyHygieneWarning,
} from '@/lib/citations'

interface UseBibliographyInput {
  sources: SourceRecord[]
  outlineNodes: OutlineNode[]
  draftSections: Array<{ id: string; html: string; content: string }>
  citations: CitationInstance[]
  styleId: ReferencingStyleId
}

export function useBibliography({
  sources,
  outlineNodes,
  draftSections,
  citations,
  styleId,
}: UseBibliographyInput) {
  const groups = useMemo(
    () => classifySources(sources, outlineNodes, draftSections),
    [sources, outlineNodes, draftSections],
  )

  const orderedIds = useMemo(
    () => orderBibliographyIds(styleId, sources, groups, draftSections, citations),
    [styleId, sources, groups, draftSections, citations],
  )

  const warnings = useMemo(
    () => buildBibliographyHygieneWarnings(sources, draftSections),
    [sources, draftSections],
  )

  const [entries, setEntries] = useState<BibliographyEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (styleId === 'none' || sources.length === 0) {
      setEntries([])
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      const formatted = await formatBibliographyBatch(sources, styleId, orderedIds)
      if (cancelled) return
      setEntries(
        buildBibliographyEntries(sources, formatted, groups, draftSections, orderedIds),
      )
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [sources, styleId, orderedIds, groups, draftSections])

  const citedIds = useMemo(
    () => new Set([...groups.entries()].filter(([, g]) => g === 'cited').map(([id]) => id)),
    [groups],
  )

  const stats = useMemo(
    () => ({
      totalSources: sources.length,
      citedCount: citedIds.size,
      outlineOnlyCount: [...groups.values()].filter((g) => g === 'outline').length,
      unusedCount: [...groups.values()].filter((g) => g === 'unused').length,
      avgReliability: computeAverageReliability(sources),
      lowReliabilityCited: countLowReliabilityCited(sources, citedIds),
    }),
    [sources, citedIds, groups],
  )

  return {
    entries,
    groups,
    warnings: warnings as BibliographyHygieneWarning[],
    stats,
    loading,
    citedIds,
  }
}
