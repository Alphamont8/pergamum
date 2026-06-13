import type { CitationInstance, CitationStyle, SourceRecord } from '@/types'
import { referencingStyleToCitationStyle } from '@/utils/referencingStyle'
import type { ReferencingStyleId } from '@/types'
import { formatCitationsInDocumentOrder, formatInTextCitation } from './service'

export interface DraftCitationSpan {
  citationId: string
  sourceId: string
  inText: string
  sectionId: string
  locator?: string
  citationNumber?: number
}

const CITATION_SPAN_RE =
  /<span[^>]*data-citation-id="([^"]*)"[^>]*data-source-id="([^"]*)"[^>]*>([^<]*)<\/span>/gi

export function buildCitationSpanHtml(span: DraftCitationSpan): string {
  const attrs = [
    `data-citation-id="${span.citationId}"`,
    `data-source-id="${span.sourceId}"`,
    'class="draft-citation"',
    span.locator ? `data-locator="${span.locator}"` : '',
    span.citationNumber != null ? `data-citation-number="${span.citationNumber}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<span ${attrs}>${span.inText}</span>`
}

export function extractCitationSpansFromHtml(
  html: string,
  sectionId: string,
): DraftCitationSpan[] {
  const spans: DraftCitationSpan[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(CITATION_SPAN_RE.source, 'gi')
  while ((match = re.exec(html)) !== null) {
    spans.push({
      citationId: match[1],
      sourceId: match[2],
      inText: match[3],
      sectionId,
    })
  }
  return spans
}

export function extractCitationSpansFromDraft(
  html: string,
  content: string,
): DraftCitationSpan[] {
  const sectionId = 'unknown'
  const fromHtml = extractCitationSpansFromHtml(html, sectionId)
  if (fromHtml.length > 0) return fromHtml
  void content
  return []
}

export function extractAllCitationSpans(
  sections: Array<{ id: string; html: string; content: string }>,
): DraftCitationSpan[] {
  const all: DraftCitationSpan[] = []
  for (const section of sections) {
    all.push(...extractCitationSpansFromHtml(section.html, section.id))
  }
  return all
}

export function citationSpansToInstances(
  spans: DraftCitationSpan[],
  style: CitationStyle,
): CitationInstance[] {
  return spans.map((span) => ({
    id: span.citationId,
    sourceId: span.sourceId,
    style,
    inText: span.inText,
    sectionId: span.sectionId,
    locator: span.locator,
    citationNumber: span.citationNumber,
  }))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Sync reconcile: extract spans and rebuild citation instances (no reformatting). */
export function reconcileDraftSections(
  sections: Array<{ id: string; label: string; html: string; content: string }>,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
): {
  sections: Array<{ id: string; label: string; html: string; content: string }>
  citations: CitationInstance[]
} {
  const style = referencingStyleToCitationStyle(styleId)
  const spans = extractAllCitationSpans(sections)
  const citations = citationSpansToInstances(spans, style)
  void sources
  return { sections, citations }
}

/**
 * Async pass: wrap legacy parentheticals and reformat all citation spans via Citation.js.
 */
export async function formatDraftCitationsAsync(
  sections: Array<{ id: string; label: string; html: string; content: string }>,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
): Promise<{
  sections: Array<{ id: string; label: string; html: string; content: string }>
  citations: CitationInstance[]
}> {
  if (styleId === 'none') {
    return reconcileDraftSections(sections, sources, styleId)
  }

  let nextSections = sections.map((s) => ({ ...s }))

  // Wrap legacy plain-text parentheticals
  for (const section of nextSections) {
    if (!section.html || section.html.includes('data-citation-id')) continue
    let html = section.html
    for (const source of sources) {
      const author = source.authors?.split(',')[0]?.trim() ?? source.title.split(' ')[0]
      const year = source.year ?? 'n.d.'
      const patterns = [
        new RegExp(`\\(${escapeRegExp(author)},\\s*${escapeRegExp(year)}\\)`, 'g'),
        new RegExp(`\\(${escapeRegExp(author)}\\s+${escapeRegExp(year)}\\)`, 'g'),
        new RegExp(`\\(${escapeRegExp(author)}\\)`, 'g'),
      ]
      for (const pattern of patterns) {
        html = await replaceLegacyMatches(html, pattern, source, sources, styleId, section.id)
      }
    }
    section.html = html
  }

  const spans = extractAllCitationSpans(nextSections)
  if (spans.length === 0) {
    return reconcileDraftSections(nextSections, sources, styleId)
  }

  const formatted = await formatCitationsInDocumentOrder(spans, sources, styleId)

  const numberBySource = new Map<string, number>()
  let num = 1
  for (const span of spans) {
    if (!numberBySource.has(span.sourceId)) {
      numberBySource.set(span.sourceId, num++)
    }
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]
    const inText = formatted[i]
    const citationNumber = numberBySource.get(span.sourceId)
    nextSections = nextSections.map((section) => {
      if (section.id !== span.sectionId) return section
      return {
        ...section,
        html: replaceCitationTextInHtml(section.html, span.citationId, inText, citationNumber),
        content: section.content.replace(span.inText, inText),
      }
    })
  }

  return reconcileDraftSections(nextSections, sources, styleId)
}

async function replaceLegacyMatches(
  html: string,
  pattern: RegExp,
  source: SourceRecord,
  allSources: SourceRecord[],
  styleId: ReferencingStyleId,
  sectionId: string,
): Promise<string> {
  const matches = [...html.matchAll(pattern)]
  if (matches.length === 0) return html

  let result = html
  for (const match of matches) {
    const citationId = `cite-${source.id}-${Math.random().toString(36).slice(2, 7)}`
    const priorSpans = extractAllCitationSpans([{ id: sectionId, html: result, content: '' }])
    const inText = await formatInTextCitation(source, styleId, allSources, {
      priorSourceIds: priorSpans.map((s) => s.sourceId),
    })
    const span = buildCitationSpanHtml({
      citationId,
      sourceId: source.id,
      inText,
      sectionId,
    })
    result = result.replace(match[0], span)
  }
  return result
}

export function replaceCitationTextInHtml(
  html: string,
  citationId: string,
  newInText: string,
  citationNumber?: number,
): string {
  return html.replace(
    new RegExp(
      `(<span[^>]*data-citation-id="${escapeRegExp(citationId)}"[^>]*>)([^<]*)(</span>)`,
      'i',
    ),
    (_m, open, _text, close) => {
      let tag = open as string
      if (citationNumber != null) {
        if (tag.includes('data-citation-number')) {
          tag = tag.replace(
            /data-citation-number="[^"]*"/,
            `data-citation-number="${citationNumber}"`,
          )
        } else {
          tag = tag.replace('<span ', `<span data-citation-number="${citationNumber}" `)
        }
      }
      return `${tag}${newInText}${close}`
    },
  )
}
