/**
 * Unified citation formatting backend powered by Citation.js (@citation-js/core + plugin-csl).
 * All bibliography and in-text citation output should flow through this module.
 */
import { Cite } from '@citation-js/core'
import type { ReferencingStyleId, SourceRecord } from '@/types'
import { isBluebookStyle, isNumericReferencingStyle } from '@/utils/referencingStyle'
import { sourcesToCslItems, type CslItem } from './csl'
import { formatBibliographyFallback, formatInTextFallback } from './fallback'
import { ensureCitationTemplates, resolveCitationTemplate } from './templates'

const DEFAULT_LANG = 'en-US'

function stripMarkup(text: string): string {
  return text.replace(/<\/?[^>]+(>|$)/g, '').trim()
}

function buildCite(sources: SourceRecord[]): Cite {
  const items = Object.values(sourcesToCslItems(sources)) as CslItem[]
  return new Cite(items.length ? items : [{ id: 'empty', type: 'article', title: 'Untitled' }])
}

async function withCite<T>(
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
  fn: (cite: Cite, template: string) => T,
): Promise<T | null> {
  if (styleId === 'none') return null
  await ensureCitationTemplates()
  const template = resolveCitationTemplate(styleId)
  if (!template) return null
  return fn(buildCite(sources), template)
}

export async function formatBibliographyEntry(
  source: SourceRecord,
  styleId: ReferencingStyleId,
  allSources: SourceRecord[],
): Promise<string> {
  if (isBluebookStyle(styleId)) return formatBibliographyFallback(source, styleId)

  try {
    const result = await withCite(allSources, styleId, (cite, template) =>
      cite.format('bibliography', {
        entry: source.id,
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
    /* fall through */
  }
  return formatBibliographyFallback(source, styleId)
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
  if (isBluebookStyle(styleId)) {
    const num = options?.priorSourceIds
      ? new Set(options.priorSourceIds).size +
        (options.priorSourceIds.includes(source.id) ? 0 : 1)
      : undefined
    return formatInTextFallback(source, styleId, num)
  }

  try {
    const entry = options?.locator
      ? { id: source.id, label: 'page', locator: options.locator }
      : source.id

    const result = await withCite(allSources, styleId, (cite, template) => {
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

  const num = isNumericReferencingStyle(styleId)
    ? options?.priorSourceIds
      ? [...new Set(options.priorSourceIds)].indexOf(source.id) + 1 ||
        new Set([...options.priorSourceIds, source.id]).size
      : 1
    : undefined
  return formatInTextFallback(source, styleId, num)
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
        nosort: isNumericReferencingStyle(styleId),
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

import { clearTemplateInit } from './templates'

export function clearCitationEngineCache(): void {
  clearTemplateInit()
}
