/**
 * Unified citation formatting backend powered by Citation.js (@citation-js/core + plugin-csl).
 * All bibliography and in-text citation output should flow through this module.
 */
import { Cite } from '@citation-js/core'
import type { ReferencingStyleId, SourceRecord } from '@/types'
import { citationNumberForSource } from '@/lib/citations/numbering'
import {
  isBluebookStyle,
  isCitationOrderStyle,
  usesNumericInTextMarker,
} from '@/utils/referencingStyle'
import { sourcesToCslItems, type CslItem } from './csl'
import { formatBibliographyFallback, formatInTextFallback } from './fallback'
import { normalizeSourceForCitation } from './normalize'
import {
  clearTemplateInit,
  ensureCitationTemplates,
  getUsableCitationTemplate,
} from './templates'

const DEFAULT_LANG = 'en-US'

function stripMarkup(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, '').trim()
}

function buildCite(sources: SourceRecord[]): Cite {
  const items = Object.values(sourcesToCslItems(sources)) as CslItem[]
  return new Cite(items.length ? items : [{ id: 'empty', type: 'article', title: 'Untitled' }])
}

/**
 * Run a Citation.js formatter only when a real template is registered.
 * Avoids plugin-csl's silent fallback to APA for missing template names.
 */
async function withCite<T>(
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
  fn: (cite: Cite, template: string) => T,
): Promise<T | null> {
  if (styleId === 'none') return null
  await ensureCitationTemplates()
  const template = getUsableCitationTemplate(styleId)
  if (!template) return null
  return fn(buildCite(sources), template)
}

export async function formatBibliographyEntry(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  allSources: SourceRecord[],
): Promise<string> {
  const clean = normalizeSourceForCitation(source)
  const cleanAll = allSources.map(normalizeSourceForCitation)
  if (isBluebookStyle(styleId)) return formatBibliographyFallback(clean, styleId)

  try {
    const result = await withCite(cleanAll, styleId, (cite, template) =>
      cite.format('bibliography', {
        entry: clean.id,
        template,
        lang: DEFAULT_LANG,
        format: 'text',
        asEntryArray: true,
      }),
    )
    if (Array.isArray(result) && result.length > 0) {
      const entry = result[0]
      if (Array.isArray(entry) && entry[1]) {
        return stripMarkup(String(entry[1]))
      }
    }
  } catch {
    /* fall through to style-specific string fallback */
  }
  return formatBibliographyFallback(clean, styleId)
}

export async function formatInTextCitation(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  allSources: SourceRecord[],
  options?: {
    priorSourceIds?: string[]
    locator?: string
  },
): Promise<string> {
  const clean = normalizeSourceForCitation(source)
  const cleanAll = allSources.map(normalizeSourceForCitation)
  const num = options?.priorSourceIds
    ? citationNumberForSource(clean.id, options.priorSourceIds)
    : usesNumericInTextMarker(styleId)
      ? 1
      : undefined

  if (isBluebookStyle(styleId)) {
    return formatInTextFallback(clean, styleId, num)
  }

  try {
    const entry = options?.locator
      ? { id: clean.id, label: 'page', locator: options.locator }
      : clean.id

    const result = await withCite(cleanAll, styleId, (cite, template) => {
      const formatOpts: Record<string, unknown> = {
        entry,
        template,
        lang: DEFAULT_LANG,
        format: 'text',
      }
      if (options?.priorSourceIds?.length) {
        formatOpts.citationsPre = options.priorSourceIds.map((id) => ({ id }))
      }
      return cite.format('citation', formatOpts)
    })

    if (typeof result === 'string' && result.trim()) {
      return stripMarkup(result)
    }
  } catch {
    /* fall through */
  }

  return formatInTextFallback(clean, styleId, num)
}

export async function formatBibliographyBatch(
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
  orderedIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  if (orderedIds.length === 0) return result

  if (isBluebookStyle(styleId)) {
    for (const id of orderedIds) {
      const src = sources.find((s) => s.id === id)
      if (src) result.set(id, formatBibliographyFallback(src, styleId))
    }
    return result
  }

  try {
    const entries = await withCite(sources, styleId, (cite, template) =>
      cite.format('bibliography', {
        entry: orderedIds,
        template,
        lang: DEFAULT_LANG,
        format: 'text',
        asEntryArray: true,
        // Keep AMA/ACS/Nature/Science/IEEE/Vancouver in citation order.
        nosort: isCitationOrderStyle(styleId),
      }),
    )

    if (Array.isArray(entries)) {
      for (const row of entries) {
        if (Array.isArray(row) && row.length >= 2) {
          result.set(String(row[0]), stripMarkup(String(row[1])))
        }
      }
    }
  } catch {
    /* fall through */
  }

  for (const id of orderedIds) {
    if (!result.has(id)) {
      const src = sources.find((s) => s.id === id)
      if (src) result.set(id, formatBibliographyFallback(src, styleId))
    }
  }

  return result
}

/** Format all in-text citations in document order (for restyle / legacy wrap). */
export async function formatCitationsInDocumentOrder(
  spans: Array<{ sourceId: string; locator?: string }>,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
): Promise<string[]> {
  const prior: string[] = []
  const formatted: string[] = []

  for (const span of spans) {
    const source = sources.find((s) => s.id === span.sourceId)
    if (!source) {
      formatted.push('')
      continue
    }
    const inText = await formatInTextCitation(source, styleId, sources, {
      priorSourceIds: [...prior],
      locator: span.locator,
    })
    formatted.push(inText)
    prior.push(span.sourceId)
  }

  return formatted
}

export function clearCitationEngineCache(): void {
  clearTemplateInit()
}
