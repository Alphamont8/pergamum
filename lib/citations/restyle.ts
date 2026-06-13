import type { CitationInstance, ReferencingStyleId, SourceRecord } from '@/types'
import { isNumericReferencingStyle } from '@/utils/referencingStyle'
import { formatCitationsInDocumentOrder } from './service'
import {
  extractAllCitationSpans,
  replaceCitationTextInHtml,
  type DraftCitationSpan,
} from './reconcile'

export async function restyleDraftCitations(
  sections: Array<{ id: string; label: string; html: string; content: string }>,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
  citations: CitationInstance[],
): Promise<{
  sections: Array<{ id: string; label: string; html: string; content: string }>
  citations: CitationInstance[]
}> {
  const spans = extractAllCitationSpans(sections)
  if (spans.length === 0) {
    return { sections, citations }
  }

  const formatted = await formatCitationsInDocumentOrder(spans, sources, styleId)

  const numberBySource = new Map<string, number>()
  if (isNumericReferencingStyle(styleId)) {
    let n = 1
    for (const span of spans) {
      if (!numberBySource.has(span.sourceId)) {
        numberBySource.set(span.sourceId, n++)
      }
    }
  }

  const updatedSpans: DraftCitationSpan[] = spans.map((span, i) => ({
    ...span,
    inText: formatted[i] ?? span.inText,
    citationNumber: numberBySource.get(span.sourceId),
  }))

  let nextSections = [...sections]
  for (const span of updatedSpans) {
    nextSections = nextSections.map((section) => {
      if (section.id !== span.sectionId) return section
      return {
        ...section,
        html: replaceCitationTextInHtml(
          section.html,
          span.citationId,
          span.inText,
          span.citationNumber,
        ),
        content: section.content.replace(
          citations.find((c) => c.id === span.citationId)?.inText ?? '',
          span.inText,
        ),
      }
    })
  }

  const nextCitations = citations.map((c) => {
    const updated = updatedSpans.find((s) => s.citationId === c.id)
    if (!updated) return c
    return {
      ...c,
      inText: updated.inText,
      citationNumber: updated.citationNumber,
    }
  })

  return { sections: nextSections, citations: nextCitations }
}
